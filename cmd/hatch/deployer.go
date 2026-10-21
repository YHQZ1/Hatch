package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"

	"github.com/YHQZ1/hatch/internal/runtime/queue"
	"github.com/joho/godotenv"
)

func runDeployer() {
	_ = godotenv.Load()

	listenerARN := mustGetEnv("ALB_LISTENER_ARN")
	if httpsListener := getEnv("ALB_HTTPS_LISTENER_ARN", ""); httpsListener != "" {
		listenerARN = httpsListener
	}

	publicURLScheme := getEnv("DEPLOYMENT_URL_SCHEME", "")
	if publicURLScheme == "" {
		if getEnv("ALB_HTTPS_LISTENER_ARN", "") != "" {
			publicURLScheme = "https"
		} else {
			publicURLScheme = "http"
		}
	}

	cfg := queue.Config{
		RabbitMQURL:          mustGetEnv("RABBITMQ_URL"),
		RedisURL:             mustGetEnv("REDIS_URL"),
		AWSRegion:            mustGetEnv("AWS_REGION"),
		ECSClusterName:       mustGetEnv("ECS_CLUSTER_NAME"),
		ALBListenerARN:       listenerARN,
		PublicURLScheme:      publicURLScheme,
		VPCID:                mustGetEnv("VPC_ID"),
		SubnetA:              mustGetEnv("SUBNET_A"),
		SubnetB:              mustGetEnv("SUBNET_B"),
		ECSSgID:              mustGetEnv("ECS_SG_ID"),
		TaskExecutionRoleARN: mustGetEnv("TASK_EXECUTION_ROLE_ARN"),
		DatabaseURL:          mustGetEnv("DATABASE_URL"),
		BaseDomain:           mustGetEnv("BASE_DOMAIN"),
		DataEncryptionKey:    getEnv("DATA_ENCRYPTION_KEY", ""),
	}
	validateProductionSecret(getEnv("ENVIRONMENT", "development"), "DATA_ENCRYPTION_KEY", cfg.DataEncryptionKey)

	worker := queue.NewWorker(cfg)

	log.Printf("Hatch Deployer started (Region: %s, Cluster: %s)", cfg.AWSRegion, cfg.ECSClusterName)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	defer worker.Close()

	errCh := make(chan error, 1)
	go func() {
		errCh <- worker.Start()
	}()

	select {
	case <-ctx.Done():
		log.Println("Shutting down deployer...")
		worker.Stop()
		if err := <-errCh; err != nil {
			log.Printf("Worker stopped with error: %v", err)
		}
	case err := <-errCh:
		if err != nil {
			log.Printf("Worker error: %v", err)
		}
	}

	log.Println("Deployer exited")
}
