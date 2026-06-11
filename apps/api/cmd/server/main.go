package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/YHQZ1/hatch/apps/api/internal/auth"
	dbconn "github.com/YHQZ1/hatch/apps/api/internal/db"
	"github.com/YHQZ1/hatch/apps/api/internal/handlers"
	"github.com/YHQZ1/hatch/apps/api/internal/middleware"
	"github.com/YHQZ1/hatch/apps/api/internal/queue"
	wsHub "github.com/YHQZ1/hatch/apps/api/internal/ws"
	"github.com/YHQZ1/hatch/packages/config"
	"github.com/YHQZ1/hatch/packages/secrets"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

func main() {
	_ = godotenv.Load()

	cfg := config.Load()

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

	r.Use(middleware.StatTracker())

	r.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORSAllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", auth.CSRFHeaderName},
		ExposeHeaders:    []string{"Content-Length", "X-Hatch-Trace-Duration"},
		AllowCredentials: true,
		MaxAge:           86400,
	}))

	authHandler := auth.NewHandler(
		cfg.GitHubClientID,
		cfg.GitHubClientSecret,
		cfg.GitHubRedirectURI,
		cfg.JWTSecret,
		db,
		secretCodec,
	)

	projectHandler := handlers.NewProjectHandler(db, publisher, cfg.WebhookBaseURL, secretCodec)
	deploymentHandler := handlers.NewDeploymentHandler(db, publisher, rdb, secretCodec)
	metricsHandler := handlers.NewMetricsHandler(db, cfg.AWSRegion, cfg.ECSClusterName, cfg.ALBListenerARN, cfg.ALBArn)
	githubHandler := handlers.NewGitHubHandler(rdb)
	webhookHandler := handlers.NewWebhookHandler(db, publisher, secretCodec)
	authMiddleware := auth.Middleware(cfg.JWTSecret, db, secretCodec)
	csrfMiddleware := auth.CSRFMiddleware()

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	r.GET("/auth/github", authHandler.RedirectToGitHub)
	r.GET("/auth/callback", authHandler.HandleCallback)
	r.POST("/auth/logout", authMiddleware, csrfMiddleware, authHandler.Logout)
	r.GET("/ws/deployments/:id", hub.HandleDeploymentLogs)
	r.POST("/api/webhooks/github", webhookHandler.HandlePush)

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

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("Hatch API starting on :%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	<-ctx.Done()
	stop()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	log.Println("Shutting down API...")
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("API shutdown failed: %v", err)
	}
	log.Println("API exited")
}
