package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"
	"time"

	"github.com/YHQZ1/hatch/internal/build/queue"
	"github.com/joho/godotenv"
)

func runBuilder() {
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
		RabbitMQ:          mustGetEnv("RABBITMQ_URL"),
		Redis:             mustGetEnv("REDIS_URL"),
		ECRRegistry:       mustGetEnv("ECR_REGISTRY"),
		ECRRepo:           mustGetEnv("ECR_REPOSITORY"),
		AWSRegion:         mustGetEnv("AWS_REGION"),
		DatabaseURL:       mustGetEnv("DATABASE_URL"),
		DataEncryptionKey: getEnv("DATA_ENCRYPTION_KEY", ""),
		Environment:       getEnv("ENVIRONMENT", "development"),
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
