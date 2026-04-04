package main

import (
	"log"
	"os"

	"github.com/YHQZ1/hatch/apps/deployer/internal/queue"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("no .env file found, reading from environment")
	}

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
	}

	log.Println("deployer worker starting...")
	worker := queue.NewWorker(cfg)
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
