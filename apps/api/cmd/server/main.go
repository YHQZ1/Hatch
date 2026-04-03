package main

import (
	"log"

	"github.com/YHQZ1/hatch/apps/api/internal/auth"
	"github.com/YHQZ1/hatch/packages/config"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	r := gin.Default()

	authHandler := auth.NewHandler(
		cfg.GitHubClientID,
		cfg.GitHubClientSecret,
		cfg.GitHubRedirectURI,
		cfg.JWTSecret,
	)

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
				"github_id": c.GetFloat64("github_id"),
				"username":  c.MustGet("username"),
			})
		})
	}

	log.Printf("api server starting on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server failed to start: %v", err)
	}
}
