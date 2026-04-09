package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port               string
	FrontendURL        string
	GitHubClientID     string
	GitHubClientSecret string
	GitHubRedirectURI  string
	JWTSecret          string
	DatabaseURL        string
	RedisURL           string
	RabbitMQURL        string
	WebhookBaseURL     string
	Environment        string
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		Port:               getEnv("PORT", "8080"),
		FrontendURL:        getEnv("FRONTEND_URL", "http://localhost:3000"),
		GitHubClientID:     mustGetEnv("GITHUB_CLIENT_ID"),
		GitHubClientSecret: mustGetEnv("GITHUB_CLIENT_SECRET"),
		GitHubRedirectURI:  mustGetEnv("GITHUB_REDIRECT_URI"),
		JWTSecret:          mustGetEnv("JWT_SECRET"),
		DatabaseURL:        mustGetEnv("DATABASE_URL"),
		RedisURL:           mustGetEnv("REDIS_URL"),
		RabbitMQURL:        mustGetEnv("RABBITMQ_URL"),
		WebhookBaseURL:     mustGetEnv("WEBHOOK_BASE_URL"),
		Environment:        getEnv("ENVIRONMENT", "development"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func mustGetEnv(key string) string {
	val := os.Getenv(key)
	if val == "" {
		log.Fatalf("Missing required environment variable: %s", key)
	}
	return val
}
