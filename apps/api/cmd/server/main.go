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
)

func main() {
	cfg := config.Load()

	db := dbconn.Connect(cfg.DatabaseURL)
	defer db.Close()

	publisher := queue.NewPublisher(cfg.RabbitMQURL)
	defer publisher.Close()

	hub := wsHub.NewHub(cfg.RedisURL)

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	authHandler := auth.NewHandler(
		cfg.GitHubClientID,
		cfg.GitHubClientSecret,
		cfg.GitHubRedirectURI,
		cfg.JWTSecret,
		db,
	)

	projectHandler := handlers.NewProjectHandler(db)
	githubHandler := handlers.NewGitHubHandler()
	deploymentHandler := handlers.NewDeploymentHandler(db, publisher)

	// public routes
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})
	r.GET("/auth/github", authHandler.RedirectToGitHub)
	r.GET("/auth/callback", authHandler.HandleCallback)
	r.GET("/ws/deployments/:id", hub.HandleDeploymentLogs)

	// protected routes (JWT required)
	protected := r.Group("/api")
	protected.Use(auth.Middleware(cfg.JWTSecret))
	{
		protected.GET("/me", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"user_id":  c.MustGet("user_id"),
				"username": c.MustGet("username"),
			})
		})
		protected.GET("/projects", projectHandler.ListProjects)
		protected.POST("/projects", projectHandler.CreateProject)
		protected.GET("/projects/:id", projectHandler.GetProject)
		protected.GET("/github/repos", githubHandler.ListRepos)
		protected.POST("/deployments", deploymentHandler.CreateDeployment)
		protected.GET("/deployments/:id", deploymentHandler.GetDeployment)
		protected.GET("/projects/:id/deployments", deploymentHandler.ListDeployments)
	}

	log.Printf("api server starting on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server failed to start: %v", err)
	}
}
