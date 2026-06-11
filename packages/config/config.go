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
	DataEncryptionKey  string
	AWSRegion          string
	ECSClusterName     string
	ALBListenerARN     string
	ALBArn             string
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
		DataEncryptionKey:  getEnv("DATA_ENCRYPTION_KEY", ""),
		AWSRegion:          getEnv("AWS_REGION", "ap-south-1"),
		ECSClusterName:     getEnv("ECS_CLUSTER_NAME", ""),
		ALBListenerARN:     firstNonEmpty(getEnv("ALB_HTTPS_LISTENER_ARN", ""), getEnv("ALB_LISTENER_ARN", "")),
		ALBArn:             getEnv("ALB_ARN", ""),
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
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
