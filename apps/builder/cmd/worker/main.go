package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/YHQZ1/hatch/apps/builder/internal/queue"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	cfg := struct {
		RabbitMQ    string
		Redis       string
		ECRRegistry string
		ECRRepo     string
		AWSRegion   string
	}{
		RabbitMQ:    getEnv("RABBITMQ_URL"),
		Redis:       getEnv("REDIS_URL"),
		ECRRegistry: getEnv("ECR_REGISTRY"),
		ECRRepo:     getEnv("ECR_REPOSITORY"),
		AWSRegion:   getEnv("AWS_REGION"),
	}

	worker := queue.NewWorker(
		cfg.RabbitMQ,
		cfg.Redis,
		cfg.ECRRegistry,
		cfg.ECRRepo,
		cfg.AWSRegion,
	)

	log.Printf("Hatch Builder started (Region: %s)", cfg.AWSRegion)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := worker.Start(); err != nil {
			log.Printf("Worker error: %v", err)
		}
	}()

	<-sigChan
	log.Println("Shutting down builder...")
	log.Println("Builder exited")
}

func getEnv(key string) string {
	val := os.Getenv(key)
	if val == "" {
		log.Fatalf("Missing required environment variable: %s", key)
	}
	return val
}
