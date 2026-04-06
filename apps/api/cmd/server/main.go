package main

import (
	"log"

	"github.com/YHQZ1/hatch/apps/api/internal/auth"
	dbconn "github.com/YHQZ1/hatch/apps/api/internal/db"
	"github.com/YHQZ1/hatch/apps/api/internal/handlers"
	"github.com/YHQZ1/hatch/apps/api/internal/queue"
	wsHub "github.com/YHQZ1/hatch/apps/api/internal/ws"
	"github.com/YHQZ1/hatch/packages/config"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

func main() {
	cfg := config.Load()

	// Infrastructure Setup
	db := dbconn.Connect(cfg.DatabaseURL)
	defer db.Close()

	publisher := queue.NewPublisher(cfg.RabbitMQURL)
	defer publisher.Close()

	hub := wsHub.NewHub(cfg.RedisURL)

	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("failed to parse redis url: %v", err)
	}
	rdb := redis.NewClient(opt)

	// Router Setup
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// Handler Initialization
	authHandler := auth.NewHandler(
		cfg.GitHubClientID,
		cfg.GitHubClientSecret,
		cfg.GitHubRedirectURI,
		cfg.JWTSecret,
		db,
	)

	projectHandler := handlers.NewProjectHandler(db, cfg.WebhookBaseURL)
	deploymentHandler := handlers.NewDeploymentHandler(db, publisher, rdb)
	githubHandler := handlers.NewGitHubHandler()
	webhookHandler := handlers.NewWebhookHandler(db, publisher)

	// Public Routes
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})
	r.GET("/auth/github", authHandler.RedirectToGitHub)
	r.GET("/auth/callback", authHandler.HandleCallback)
	r.GET("/ws/deployments/:id", hub.HandleDeploymentLogs)
	r.POST("/webhooks/github", webhookHandler.HandlePush)

	// Protected API Routes
	api := r.Group("/api")
	api.Use(auth.Middleware(cfg.JWTSecret))
	{
		api.GET("/me", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"user_id":  c.MustGet("user_id"),
				"username": c.MustGet("username"),
			})
		})

		// Projects
		api.GET("/projects", projectHandler.ListProjects)
		api.POST("/projects", projectHandler.CreateProject)
		api.GET("/projects/:id", projectHandler.GetProject)
		api.DELETE("/projects/:id", projectHandler.DeleteProject)
		api.GET("/projects/:id/deployments", deploymentHandler.ListDeployments)

		// Deployments & Logs
		api.POST("/deployments", deploymentHandler.CreateDeployment)
		api.GET("/deployments/:id", deploymentHandler.GetDeployment)
		api.GET("/deployments/:id/logs", deploymentHandler.GetDeploymentLogs)

		// GitHub Integration
		api.GET("/github/repos", githubHandler.ListRepos)
		api.GET("/github/repos/:owner/:repo/dockerfile", githubHandler.CheckDockerfile)
	}

	log.Printf("api server starting on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server failed to start: %v", err)
	}
}
