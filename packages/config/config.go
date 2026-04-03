package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port               string
	GitHubClientID     string
	GitHubClientSecret string
	GitHubRedirectURI  string
	JWTSecret          string
	DatabaseURL        string
	RedisURL           string
	RabbitMQURL        string
}

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("no .env file found, reading from environment")
	}

	return &Config{
		Port:               getEnv("PORT", "8080"),
		GitHubClientID:     mustGetEnv("GITHUB_CLIENT_ID"),
		GitHubClientSecret: mustGetEnv("GITHUB_CLIENT_SECRET"),
		GitHubRedirectURI:  mustGetEnv("GITHUB_REDIRECT_URI"),
		JWTSecret:          mustGetEnv("JWT_SECRET"),
		DatabaseURL:        mustGetEnv("DATABASE_URL"),
		RedisURL:           mustGetEnv("REDIS_URL"),
		RabbitMQURL:        mustGetEnv("RABBITMQ_URL"),
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
		log.Fatalf("required environment variable %s is not set", key)
	}
	return val
}
