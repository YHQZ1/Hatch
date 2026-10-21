package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/YHQZ1/hatch/internal/api/auth"
	"github.com/YHQZ1/hatch/internal/api/handlers"
	"github.com/YHQZ1/hatch/internal/api/middleware"
	"github.com/YHQZ1/hatch/internal/api/queue"
	"github.com/YHQZ1/hatch/internal/api/spa"
	wsHub "github.com/YHQZ1/hatch/internal/api/ws"
	"github.com/YHQZ1/hatch/internal/config"
	"github.com/YHQZ1/hatch/internal/secrets"
	dbconn "github.com/YHQZ1/hatch/internal/store"
	"github.com/YHQZ1/hatch/web"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

func runAPI() {
	_ = godotenv.Load()

	cfg := config.Load()
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	db := dbconn.Connect(cfg.DatabaseURL)
	defer db.Close()

	secretCodec, err := secrets.NewCodec(cfg.DataEncryptionKey)
	if err != nil {
		log.Fatalf("Failed to initialize secret codec: %v", err)
	}

	publisher := queue.NewPublisher(cfg.RabbitMQURL)
	defer publisher.Close()

	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("Failed to parse Redis URL: %v", err)
	}

	rdb := redis.NewClient(opt)
	defer rdb.Close()
	hub := wsHub.NewHub(cfg.RedisURL, cfg.JWTSecret, cfg.CORSAllowedOrigins, db)
	defer hub.Close()

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORSAllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", auth.CSRFHeaderName},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           86400,
	}))
	r.Use(middleware.BodyLimit(4 << 20))
	r.Use(middleware.StatTracker())

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

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	serverErrors := make(chan error, 1)
	go func() {
		log.Printf("Hatch API starting on :%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			serverErrors <- err
		}
	}()

	select {
	case <-ctx.Done():
		stop()
	case err := <-serverErrors:
		log.Printf("API server failed: %v", err)
		return
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	log.Println("Shutting down API...")
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("API graceful shutdown failed: %v", err)
		if closeErr := server.Close(); closeErr != nil {
			log.Printf("API forced shutdown failed: %v", closeErr)
		}
	}
	log.Println("API exited")
}
