package main

import (
	"log"

	"github.com/YHQZ1/hatch/apps/api/internal/auth"
	dbconn "github.com/YHQZ1/hatch/apps/api/internal/db"
	"github.com/YHQZ1/hatch/apps/api/internal/handlers"
	"github.com/YHQZ1/hatch/packages/config"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	db := dbconn.Connect(cfg.DatabaseURL)
	defer db.Close()

	r := gin.Default()

	authHandler := auth.NewHandler(
		cfg.GitHubClientID,
		cfg.GitHubClientSecret,
		cfg.GitHubRedirectURI,
		cfg.JWTSecret,
		db,
	)

	projectHandler := handlers.NewProjectHandler(db)
	githubHandler := handlers.NewGitHubHandler()

	// public routes
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})
	r.GET("/auth/github", authHandler.RedirectToGitHub)
	r.GET("/auth/callback", authHandler.HandleCallback)

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
	}

	log.Printf("api server starting on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server failed to start: %v", err)
	}
}
