package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/YHQZ1/hatch/apps/deployer/internal/queue"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	cfg := queue.Config{
		RabbitMQURL:          mustGetEnv("RABBITMQ_URL"),
		RedisURL:             mustGetEnv("REDIS_URL"),
		AWSRegion:            mustGetEnv("AWS_REGION"),
		ECSClusterName:       mustGetEnv("ECS_CLUSTER_NAME"),
		ALBListenerARN:       mustGetEnv("ALB_LISTENER_ARN"),
		VPCID:                mustGetEnv("VPC_ID"),
		SubnetA:              mustGetEnv("SUBNET_A"),
		SubnetB:              mustGetEnv("SUBNET_B"),
		ECSSgID:              mustGetEnv("ECS_SG_ID"),
		TaskExecutionRoleARN: mustGetEnv("TASK_EXECUTION_ROLE_ARN"),
		ECRRegistry:          mustGetEnv("ECR_REGISTRY"),
		DatabaseURL:          mustGetEnv("DATABASE_URL"),
		BaseDomain:           mustGetEnv("BASE_DOMAIN"),
	}

	worker := queue.NewWorker(cfg)

	log.Printf("Hatch Deployer started (Region: %s, Cluster: %s)", cfg.AWSRegion, cfg.ECSClusterName)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := worker.Start(); err != nil {
			log.Printf("Worker error: %v", err)
		}
	}()

	<-sigChan
	log.Println("Shutting down deployer...")
	log.Println("Deployer exited")
}

func mustGetEnv(key string) string {
	val := os.Getenv(key)
	if val == "" {
		log.Fatalf("Missing required environment variable: %s", key)
	}
	return val
}
