package main

import (
	"log"
	"os"

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

	log.Printf("Hatch Builder starting (Region: %s)", cfg.AWSRegion)
	if err := worker.Start(); err != nil {
		log.Fatalf("builder crash: %v", err)
	}
}

func getEnv(key string) string {
	val := os.Getenv(key)
	if val == "" {
		log.Fatalf("builder: missing required environment variable: %s", key)
	}
	return val
}
