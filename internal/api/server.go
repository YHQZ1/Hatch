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
	"github.com/YHQZ1/hatch/internal/api/spa"
	"github.com/YHQZ1/hatch/internal/config"
	"github.com/YHQZ1/hatch/internal/jobs"
	"github.com/YHQZ1/hatch/internal/proxy"
	"github.com/YHQZ1/hatch/internal/secrets"
	"github.com/YHQZ1/hatch/internal/store"
	"github.com/YHQZ1/hatch/internal/stream"
	"github.com/YHQZ1/hatch/web"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// LocalTarget is what the API needs from the local target: the traffic the proxy
// counted, and a way to find where each app listens.
type LocalTarget struct {
	Stats    *proxy.Stats
	Resolver proxy.Resolver
}

// Run serves the web UI and the API until ctx is canceled, then shuts down
// gracefully. It returns an error if it cannot start or the server fails.
//
// local is what the API shares with the local target's proxy; it is nil when
// Hatch serves no apps itself (the AWS target).
func Run(ctx context.Context, cfg *config.Config, local *LocalTarget) error {
	// Hatch logs requests itself (middleware.AccessLog), so Gin's own debug
	// output, such as the route table, would only be noise.
	gin.SetMode(gin.ReleaseMode)

	db, err := store.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	secretCodec, err := secrets.NewCodec(cfg.DataEncryptionKey)
	if err != nil {
		return fmt.Errorf("initialize secret codec: %w", err)
	}

	// The API only causes jobs; the job runner (hatch serve or hatch worker)
	// works them.
	inserter, err := jobs.NewInserter(db)
	if err != nil {
		return err
	}

	sessions := auth.NewSessions(db)

	// One connection listens for deployment events (new log lines, status
	// changes) and wakes the log streams watching them. It stops with ctx, and
	// is waited for before the pool closes.
	broker := stream.NewBroker(db)
	brokerDone := make(chan struct{})
	go func() {
		defer close(brokerDone)
		_ = broker.Run(ctx)
	}()
	defer func() { <-brokerDone }()

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

	authHandler := auth.NewHandler(auth.Config{
		ClientID:     cfg.GitHubClientID,
		ClientSecret: cfg.GitHubClientSecret,
		RedirectURI:  cfg.GitHubRedirectURI,
		FrontendURL:  cfg.FrontendURL,
		AppSlug:      cfg.GitHubAppSlug,
	}, db, sessions, secretCodec)
	tokens := auth.NewTokens(db, secretCodec, cfg.GitHubClientID, cfg.GitHubClientSecret)

	projectHandler := handlers.NewProjectHandler(db, inserter, cfg.WebhookBaseURL, secretCodec)
	deploymentHandler := handlers.NewDeploymentHandler(db, inserter, stream.NewPostgres(db), secretCodec)
	logStreamHandler := handlers.NewLogStreamHandler(db, broker, ctx.Done())
	metricsHandler := handlers.NewMetricsHandler(db, cfg.AWSRegion, cfg.ECSClusterName, cfg.ALBListenerARN, cfg.ALBArn)
	githubHandler := handlers.NewGitHubHandler()
	var stats *proxy.Stats
	var resolver proxy.Resolver
	if local != nil {
		stats, resolver = local.Stats, local.Resolver
	}
	trafficHandler := handlers.NewTrafficHandler(db, stats)
	iconHandler := handlers.NewIconHandler(db, resolver)
	publicConfigHandler := handlers.NewPublicConfigHandler(cfg.BaseDomain, cfg.DeploymentURLScheme)
	webhookHandler := handlers.NewWebhookHandler(db, inserter, secretCodec)
	authMiddleware := auth.Middleware(sessions, tokens)
	csrfMiddleware := auth.CSRFMiddleware()

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	r.GET("/ready", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()

		checks := gin.H{"database": "ok"}
		ready := true
		if err := db.Ping(ctx); err != nil {
			checks["database"] = "unavailable"
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
	r.GET("/auth/install", authHandler.RedirectToInstall)
	r.GET("/auth/callback", authHandler.HandleCallback)
	r.POST("/auth/logout", authMiddleware, csrfMiddleware, authHandler.Logout)
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
		api.GET("/subdomains/:name", projectHandler.CheckSubdomain)
		api.GET("/projects/:id", projectHandler.GetProject)
		api.PUT("/projects/:id", projectHandler.UpdateProject)
		api.GET("/projects/:id/env-vars", projectHandler.GetProjectEnvVars)
		api.PUT("/projects/:id/env-vars", projectHandler.UpdateProjectEnvVars)
		api.POST("/projects/:id/suspend", projectHandler.SuspendProject)
		api.POST("/projects/:id/resume", projectHandler.ResumeProject)
		api.DELETE("/projects/:id", projectHandler.DeleteProject)
		api.GET("/projects/:id/deployments", deploymentHandler.ListDeployments)
		api.GET("/projects/:id/metrics", metricsHandler.GetProjectMetrics)
		api.GET("/projects/:id/icon", iconHandler.Get)
		api.GET("/activity", projectHandler.GetActivity)
		api.GET("/traffic", trafficHandler.Get)
		api.POST("/deployments", deploymentHandler.CreateDeployment)
		api.GET("/deployments/:id", deploymentHandler.GetDeployment)
		api.POST("/deployments/:id/rollback", deploymentHandler.RollbackDeployment)
		api.POST("/deployments/:id/cancel", deploymentHandler.CancelDeployment)
		api.GET("/deployments/:id/logs", deploymentHandler.GetDeploymentLogs)
		api.GET("/deployments/:id/logs/stream", logStreamHandler.Stream)
		api.GET("/github/repos", githubHandler.ListRepos)
		api.GET("/github/repos/:owner/:repo/dockerfile", githubHandler.CheckDockerfile)
	}

	// Everything else is the web UI. Its client-side routes (such as /overview)
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
