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
	conn     *amqp.Connection
	ch       *amqp.Channel
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
		log.Fatalf("Failed to connect to database: %v", err)
	}

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	return &Worker{
		cfg:      cfg,
		streamer: streamer,
		deployer: deployer,
		db:       db,
	}
}

func (w *Worker) Start() error {
	var err error
	w.conn, err = amqp.Dial(w.cfg.RabbitMQURL)
	if err != nil {
		return fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	w.ch, err = w.conn.Channel()
	if err != nil {
		return fmt.Errorf("failed to open channel: %w", err)
	}

	_, err = w.ch.QueueDeclare("hatch.deploy.jobs", true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("failed to declare deploy queue: %w", err)
	}

	_, err = w.ch.QueueDeclare("hatch.cleanup.jobs", true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("failed to declare cleanup queue: %w", err)
	}

	deployMsgs, err := w.ch.Consume("hatch.deploy.jobs", "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("failed to consume deploy queue: %w", err)
	}

	cleanupMsgs, err := w.ch.Consume("hatch.cleanup.jobs", "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("failed to consume cleanup queue: %w", err)
	}

	go w.handleCleanupJobs(cleanupMsgs)

	log.Println("Deployer worker started")

	for msg := range deployMsgs {
		var job DeployJobEvent
		if err := json.Unmarshal(msg.Body, &job); err != nil {
			msg.Nack(false, false)
			continue
		}

		w.processJob(job)
		msg.Ack(false)
	}

	return nil
}

func (w *Worker) handleCleanupJobs(msgs <-chan amqp.Delivery) {
	for msg := range msgs {
		var slugs []string
		if err := json.Unmarshal(msg.Body, &slugs); err != nil {
			msg.Nack(false, false)
			continue
		}

		for _, slug := range slugs {
			if err := w.deployer.Teardown(context.Background(), slug); err != nil {
				log.Printf("Failed to teardown %s: %v", slug, err)
			}
		}
		msg.Ack(false)
	}
}

func (w *Worker) processJob(job DeployJobEvent) {
	ctx := context.Background()
	w.updateDeploymentStatus(ctx, job.DeploymentID, "deploying")

	envMap := w.fetchEnvVars(ctx, job.DeploymentID)

	url, err := w.deployer.Deploy(ctx, ecsdeploy.DeployInput{
		DeploymentID: job.DeploymentID,
		ImageURI:     job.ImageURI,
		Port:         job.Port,
		CPU:          job.CPU,
		MemoryMB:     job.MemoryMB,
		HealthCheck:  job.HealthCheck,
		Subdomain:    job.Subdomain,
		EnvVars:      envMap,
	})

	if err != nil {
		w.streamer.Publish(ctx, job.DeploymentID, fmt.Sprintf("Deployment failed: %v", err))
		w.updateDeploymentStatus(ctx, job.DeploymentID, "failed")
		return
	}

	w.finalizeDeployment(ctx, job.DeploymentID, job.ImageURI, url)
}

func (w *Worker) fetchEnvVars(ctx context.Context, deploymentID string) map[string]string {
	envMap := make(map[string]string)

	rows, err := w.db.QueryContext(ctx, "SELECT key, value FROM env_vars WHERE deployment_id = $1", deploymentID)
	if err != nil {
		return envMap
	}
	defer rows.Close()

	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err == nil {
			envMap[k] = v
		}
	}

	return envMap
}

func (w *Worker) updateDeploymentStatus(ctx context.Context, id, status string) {
	_, err := w.db.ExecContext(ctx, "UPDATE deployments SET status = $1 WHERE id = $2", status, id)
	if err != nil {
		log.Printf("Failed to update deployment status for %s: %v", id, err)
	}
}

func (w *Worker) finalizeDeployment(ctx context.Context, id, image, url string) {
	query := `
		UPDATE deployments 
		SET status = 'live', image_uri = $2, url = $3, deployed_at = now() 
		WHERE id = $1`

	_, err := w.db.ExecContext(ctx, query, id, image, url)
	if err != nil {
		log.Printf("Failed to finalize deployment %s: %v", id, err)
		w.streamer.Publish(ctx, id, fmt.Sprintf("Warning: Deployment live but status update failed: %v", err))
	}
}

func (w *Worker) Close() {
	if w.db != nil {
		w.db.Close()
	}
	if w.ch != nil {
		w.ch.Close()
	}
	if w.conn != nil {
		w.conn.Close()
	}
}
