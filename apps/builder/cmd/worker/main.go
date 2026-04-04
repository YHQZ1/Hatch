package main

import (
	"log"
	"os"

	"github.com/YHQZ1/hatch/apps/builder/internal/queue"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("no .env file found, reading from environment")
	}

	rabbitmqURL := mustGetEnv("RABBITMQ_URL")
	redisURL := mustGetEnv("REDIS_URL")
	ecrRegistry := mustGetEnv("ECR_REGISTRY")
	ecrRepo := mustGetEnv("ECR_REPOSITORY")
	awsRegion := mustGetEnv("AWS_REGION")

	log.Println("builder worker starting...")

	worker := queue.NewWorker(rabbitmqURL, redisURL, ecrRegistry, ecrRepo, awsRegion)
	if err := worker.Start(); err != nil {
		log.Fatalf("worker failed: %v", err)
	}
}

func mustGetEnv(key string) string {
	val := os.Getenv(key)
	if val == "" {
		log.Fatalf("required env var %s is not set", key)
	}
	return val
}
