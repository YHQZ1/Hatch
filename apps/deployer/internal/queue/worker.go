package queue

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"

	ecsdeploy "github.com/YHQZ1/hatch/apps/deployer/internal/ecs"
	"github.com/YHQZ1/hatch/apps/deployer/internal/logs"
	_ "github.com/lib/pq"
	amqp "github.com/rabbitmq/amqp091-go"
)

type Config struct {
	RabbitMQURL          string
	RedisURL             string
	AWSRegion            string
	ECSClusterName       string
	ALBListenerARN       string
	VPCID                string
	SubnetA              string
	SubnetB              string
	ECSSgID              string
	TaskExecutionRoleARN string
	ECRRegistry          string
	DatabaseURL          string
	BaseDomain           string
}

type DeployJobEvent struct {
	DeploymentID string `json:"deployment_id"`
	ImageURI     string `json:"image_uri"`
	CPU          int32  `json:"cpu"`
	MemoryMB     int32  `json:"memory_mb"`
	Port         int32  `json:"port"`
	HealthCheck  string `json:"health_check"`
	Subdomain    string `json:"subdomain"`
}

type Worker struct {
	cfg      Config
	streamer *logs.Streamer
	deployer *ecsdeploy.Deployer
	db       *sql.DB
}

func NewWorker(cfg Config) *Worker {
	streamer := logs.NewStreamer(cfg.RedisURL)
	deployer := ecsdeploy.NewDeployer(
		cfg.AWSRegion, cfg.ECSClusterName, cfg.ALBListenerARN,
		cfg.VPCID, cfg.SubnetA, cfg.SubnetB, cfg.ECSSgID,
		cfg.TaskExecutionRoleARN, cfg.BaseDomain, streamer,
	)

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("deployer: db connection failed: %v", err)
	}

	return &Worker{cfg: cfg, streamer: streamer, deployer: deployer, db: db}
}

func (w *Worker) Start() error {
	defer w.db.Close()

	conn, err := amqp.Dial(w.cfg.RabbitMQURL)
	if err != nil {
		return fmt.Errorf("rabbitmq connection failed: %w", err)
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		return fmt.Errorf("rabbitmq channel failed: %w", err)
	}
	defer ch.Close()

	// Ensure queues exist
	_, _ = ch.QueueDeclare("hatch.deploy.jobs", true, false, false, false, nil)
	_, _ = ch.QueueDeclare("hatch.cleanup.jobs", true, false, false, false, nil)

	deployMsgs, _ := ch.Consume("hatch.deploy.jobs", "", false, false, false, false, nil)
	cleanupMsgs, _ := ch.Consume("hatch.cleanup.jobs", "", false, false, false, false, nil)

	// Background Cleanup Listener
	go func() {
		log.Println("Deployer: listening for cleanup tasks...")
		for msg := range cleanupMsgs {
			var slugs []string
			if err := json.Unmarshal(msg.Body, &slugs); err == nil {
				for _, slug := range slugs {
					_ = w.deployer.Teardown(context.Background(), slug)
				}
			}
			_ = msg.Ack(false)
		}
	}()

	log.Println("Deployer: listening for deployment jobs...")

	for msg := range deployMsgs {
		var job DeployJobEvent
		if err := json.Unmarshal(msg.Body, &job); err != nil {
			_ = msg.Nack(false, false)
			continue
		}

		w.processJob(job)
		_ = msg.Ack(false)
	}

	return nil
}

func (w *Worker) processJob(job DeployJobEvent) {
	ctx := context.Background()
	w.updateStatus(ctx, job.DeploymentID, "deploying")

	url, err := w.deployer.Deploy(ctx, ecsdeploy.DeployInput{
		DeploymentID: job.DeploymentID,
		ImageURI:     job.ImageURI,
		Port:         job.Port,
		CPU:          job.CPU,
		MemoryMB:     job.MemoryMB,
		HealthCheck:  job.HealthCheck,
		Subdomain:    job.Subdomain,
	})

	if err != nil {
		w.streamer.Publish(ctx, job.DeploymentID, fmt.Sprintf("✗ Orchestration failed: %v", err))
		w.updateStatus(ctx, job.DeploymentID, "failed")
		return
	}

	w.finalizeDeployment(ctx, job.DeploymentID, job.ImageURI, url)
}

func (w *Worker) updateStatus(ctx context.Context, id, status string) {
	_, _ = w.db.ExecContext(ctx, "UPDATE deployments SET status = $1 WHERE id = $2", status, id)
}

func (w *Worker) finalizeDeployment(ctx context.Context, id, image, url string) {
	query := `
		UPDATE deployments 
		SET status = 'live', image_uri = $2, url = $3, deployed_at = now() 
		WHERE id = $1`

	_, err := w.db.ExecContext(ctx, query, id, image, url)
	if err != nil {
		log.Printf("worker: failed to finalize deployment %s: %v", id, err)
	}
}
