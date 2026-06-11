package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/YHQZ1/hatch/apps/builder/internal/queue"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	cfg := struct {
		RabbitMQ          string
		Redis             string
		ECRRegistry       string
		ECRRepo           string
		AWSRegion         string
		DatabaseURL       string
		DataEncryptionKey string
		Environment       string
		BuildTimeout      time.Duration
	}{
		RabbitMQ:          getEnv("RABBITMQ_URL"),
		Redis:             getEnv("REDIS_URL"),
		ECRRegistry:       getEnv("ECR_REGISTRY"),
		ECRRepo:           getEnv("ECR_REPOSITORY"),
		AWSRegion:         getEnv("AWS_REGION"),
		DatabaseURL:       getEnv("DATABASE_URL"),
		DataEncryptionKey: getOptionalEnv("DATA_ENCRYPTION_KEY"),
		Environment:       getEnvWithDefault("ENVIRONMENT", "development"),
		BuildTimeout:      getDurationEnv("BUILD_TIMEOUT", 30*time.Minute),
	}
	validateProductionSecret(cfg.Environment, "DATA_ENCRYPTION_KEY", cfg.DataEncryptionKey)

	worker := queue.NewWorker(
		cfg.RabbitMQ,
		cfg.Redis,
		cfg.ECRRegistry,
		cfg.ECRRepo,
		cfg.AWSRegion,
		cfg.DatabaseURL,
		cfg.DataEncryptionKey,
		cfg.BuildTimeout,
	)

	log.Printf("Hatch Builder started (Region: %s)", cfg.AWSRegion)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	defer worker.Close()

	errCh := make(chan error, 1)
	go func() {
		errCh <- worker.Start()
	}()

	select {
	case <-ctx.Done():
		log.Println("Shutting down builder...")
		worker.Stop()
		if err := <-errCh; err != nil {
			log.Printf("Worker stopped with error: %v", err)
		}
	case err := <-errCh:
		if err != nil {
			log.Printf("Worker error: %v", err)
		}
	}

	log.Println("Builder exited")
}

func getEnv(key string) string {
	val := os.Getenv(key)
	if val == "" {
		log.Fatalf("Missing required environment variable: %s", key)
	}
	return val
}

func getOptionalEnv(key string) string {
	return os.Getenv(key)
}

func getEnvWithDefault(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func validateProductionSecret(environment, key, value string) {
	if environment != "production" {
		return
	}
	if len(strings.TrimSpace(value)) < 32 {
		log.Fatalf("%s must be at least 32 characters in production", key)
	}
}

func getDurationEnv(key string, fallback time.Duration) time.Duration {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(val)
	if err != nil {
		log.Fatalf("Invalid duration for %s: %v", key, err)
	}
	return parsed
}
