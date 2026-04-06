package main

import (
	"log"
	"net/http"

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

	db := dbconn.Connect(cfg.DatabaseURL)
	defer db.Close()

	publisher := queue.NewPublisher(cfg.RabbitMQURL)
	defer publisher.Close()

	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("failed to parse redis url: %v", err)
	}
	rdb := redis.NewClient(opt)
	hub := wsHub.NewHub(cfg.RedisURL)

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           86400,
	}))

	authHandler := auth.NewHandler(
		cfg.GitHubClientID,
		cfg.GitHubClientSecret,
		cfg.GitHubRedirectURI,
		cfg.JWTSecret,
		db,
	)

	projectHandler := handlers.NewProjectHandler(db, publisher, cfg.WebhookBaseURL)
	deploymentHandler := handlers.NewDeploymentHandler(db, publisher, rdb)
	githubHandler := handlers.NewGitHubHandler()
	webhookHandler := handlers.NewWebhookHandler(db, publisher)

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	r.GET("/auth/github", authHandler.RedirectToGitHub)
	r.GET("/auth/callback", authHandler.HandleCallback)
	r.GET("/ws/deployments/:id", hub.HandleDeploymentLogs)
	r.POST("/webhooks/github", webhookHandler.HandlePush)

	api := r.Group("/api")
	api.Use(auth.Middleware(cfg.JWTSecret))
	{
		api.GET("/me", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"user_id":  c.MustGet("user_id"),
				"username": c.MustGet("username"),
			})
		})

		api.GET("/projects", projectHandler.ListProjects)
		api.POST("/projects", projectHandler.CreateProject)
		api.GET("/projects/:id", projectHandler.GetProject)
		api.DELETE("/projects/:id", projectHandler.DeleteProject)
		api.GET("/projects/:id/deployments", deploymentHandler.ListDeployments)

		api.GET("/activity", projectHandler.GetActivity)

		api.POST("/deployments", deploymentHandler.CreateDeployment)
		api.GET("/deployments/:id", deploymentHandler.GetDeployment)
		api.GET("/deployments/:id/logs", deploymentHandler.GetDeploymentLogs)

		api.GET("/github/repos", githubHandler.ListRepos)
		api.GET("/github/repos/:owner/:repo/dockerfile", githubHandler.CheckDockerfile)
	}

	log.Printf("Hatch API starting on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server crash: %v", err)
	}
}
