package api

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/YHQZ1/hatch/internal/api/auth"
	"github.com/YHQZ1/hatch/internal/api/handlers"
	"github.com/YHQZ1/hatch/internal/api/middleware"
	"github.com/YHQZ1/hatch/internal/api/queue"
	"github.com/YHQZ1/hatch/internal/api/spa"
	wsHub "github.com/YHQZ1/hatch/internal/api/ws"
	"github.com/YHQZ1/hatch/internal/config"
	"github.com/YHQZ1/hatch/internal/secrets"
	"github.com/YHQZ1/hatch/internal/store"
	"github.com/YHQZ1/hatch/web"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// Run serves the web UI and the API until ctx is canceled, then shuts down
// gracefully. It returns an error if it cannot start or the server fails.
func Run(ctx context.Context, cfg *config.Config) error {
	// Hatch logs requests itself (middleware.AccessLog), so Gin's own debug
	// output, such as the route table, would only be noise.
	gin.SetMode(gin.ReleaseMode)

	db, err := store.Connect(cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	secretCodec, err := secrets.NewCodec(cfg.DataEncryptionKey)
	if err != nil {
		return fmt.Errorf("initialize secret codec: %w", err)
	}

	publisher := queue.NewPublisher(cfg.RabbitMQURL)
	defer publisher.Close()

	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return fmt.Errorf("parse REDIS_URL: %w", err)
	}

	rdb := redis.NewClient(opt)
	defer rdb.Close()
	hub, err := wsHub.NewHub(cfg.RedisURL, cfg.JWTSecret, cfg.CORSAllowedOrigins, db)
	if err != nil {
		return err
	}
	defer hub.Close()

	r := gin.New()
	r.Use(middleware.RequestID(), middleware.AccessLog(), middleware.Recovery())

	r.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORSAllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", auth.CSRFHeaderName},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           86400,
	}))
	r.Use(middleware.BodyLimit(4 << 20))

	authHandler := auth.NewHandler(
		cfg.GitHubClientID,
		cfg.GitHubClientSecret,
		cfg.GitHubRedirectURI,
		cfg.FrontendURL,
		cfg.JWTSecret,
		db,
		secretCodec,
	)

	projectHandler := handlers.NewProjectHandler(db, publisher, cfg.WebhookBaseURL, secretCodec)
	deploymentHandler := handlers.NewDeploymentHandler(db, publisher, rdb, secretCodec)
	metricsHandler := handlers.NewMetricsHandler(db, cfg.AWSRegion, cfg.ECSClusterName, cfg.ALBListenerARN, cfg.ALBArn)
	githubHandler := handlers.NewGitHubHandler(rdb)
	publicConfigHandler := handlers.NewPublicConfigHandler(cfg.BaseDomain, cfg.DeploymentURLScheme)
	webhookHandler := handlers.NewWebhookHandler(db, publisher, secretCodec)
	authMiddleware := auth.Middleware(cfg.JWTSecret, db, secretCodec)
	csrfMiddleware := auth.CSRFMiddleware()

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	r.GET("/ready", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()

		checks := gin.H{"database": "ok", "redis": "ok", "rabbitmq": "ok"}
		ready := true
		if err := db.PingContext(ctx); err != nil {
			checks["database"] = "unavailable"
			ready = false
		}
		if err := rdb.Ping(ctx).Err(); err != nil {
			checks["redis"] = "unavailable"
			ready = false
		}
		if !publisher.Healthy() {
			checks["rabbitmq"] = "unavailable"
			ready = false
		}

		status := http.StatusOK
		state := "ready"
		if !ready {
			status = http.StatusServiceUnavailable
			state = "not_ready"
		}
		c.JSON(status, gin.H{"status": state, "checks": checks})
	})

	r.GET("/auth/github", authHandler.RedirectToGitHub)
	r.GET("/auth/callback", authHandler.HandleCallback)
	r.POST("/auth/logout", authMiddleware, csrfMiddleware, authHandler.Logout)
	r.GET("/ws/deployments/:id", hub.HandleDeploymentLogs)
	r.POST("/api/webhooks/github", webhookHandler.HandlePush)
	r.GET("/api/config", publicConfigHandler.Get)

	api := r.Group("/api")
	api.Use(authMiddleware, csrfMiddleware)
	{
		api.GET("/me", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"user_id":   c.MustGet("user_id"),
				"github_id": c.MustGet("github_id"),
				"username":  c.MustGet("username"),
			})
		})
		api.GET("/csrf", func(c *gin.Context) {
			token, err := auth.EnsureCSRFCookieWithError(c)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create csrf token"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"csrf_token": token})
		})

		api.GET("/projects", projectHandler.ListProjects)
		api.POST("/projects", projectHandler.CreateProject)
		api.GET("/projects/:id", projectHandler.GetProject)
		api.PUT("/projects/:id", projectHandler.UpdateProject)
		api.GET("/projects/:id/env-vars", projectHandler.GetProjectEnvVars)
		api.PUT("/projects/:id/env-vars", projectHandler.UpdateProjectEnvVars)
		api.POST("/projects/:id/suspend", projectHandler.SuspendProject)
		api.POST("/projects/:id/resume", projectHandler.ResumeProject)
		api.DELETE("/projects/:id", projectHandler.DeleteProject)
		api.GET("/projects/:id/deployments", deploymentHandler.ListDeployments)
		api.GET("/projects/:id/metrics", metricsHandler.GetProjectMetrics)
		api.GET("/activity", projectHandler.GetActivity)
		api.POST("/deployments", deploymentHandler.CreateDeployment)
		api.GET("/deployments/:id", deploymentHandler.GetDeployment)
		api.POST("/deployments/:id/cancel", deploymentHandler.CancelDeployment)
		api.GET("/deployments/:id/logs", deploymentHandler.GetDeploymentLogs)
		api.GET("/github/repos", githubHandler.ListRepos)
		api.GET("/github/repos/:owner/:repo/dockerfile", githubHandler.CheckDockerfile)
	}

	// Everything else is the web UI. Its client-side routes (such as /console)
	// get index.html so a page reload works.
	r.NoRoute(gin.WrapH(spa.Handler(web.Dist())))

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	serverErrors := make(chan error, 1)
	go func() {
		slog.Info("API listening", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
		}
	}()

	select {
	case <-ctx.Done():
	case err := <-serverErrors:
		return fmt.Errorf("API server failed: %w", err)
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	slog.Info("API shutting down")
	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("API graceful shutdown failed", "error", err)
		if closeErr := server.Close(); closeErr != nil {
			slog.Error("API forced shutdown failed", "error", closeErr)
		}
	}
	slog.Info("API stopped")
	return nil
}
