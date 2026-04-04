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
		cfg.AWSRegion,
		cfg.ECSClusterName,
		cfg.ALBListenerARN,
		cfg.VPCID,
		cfg.SubnetA,
		cfg.SubnetB,
		cfg.ECSSgID,
		cfg.TaskExecutionRoleARN,
		streamer,
	)

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}

	return &Worker{cfg: cfg, streamer: streamer, deployer: deployer, db: db}
}

func (w *Worker) Start() error {
	conn, err := amqp.Dial(w.cfg.RabbitMQURL)
	if err != nil {
		return fmt.Errorf("failed to connect to rabbitmq: %w", err)
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		return fmt.Errorf("failed to open channel: %w", err)
	}
	defer ch.Close()

	q, err := ch.QueueDeclare("hatch.deploy.jobs", true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("failed to declare queue: %w", err)
	}

	msgs, err := ch.Consume(q.Name, "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("failed to consume: %w", err)
	}

	log.Printf("deployer worker ready — listening on %s", q.Name)

	for msg := range msgs {
		var job DeployJobEvent
		if err := json.Unmarshal(msg.Body, &job); err != nil {
			log.Printf("failed to parse job: %v", err)
			msg.Nack(false, false)
			continue
		}

		log.Printf("received deploy job for deployment %s", job.DeploymentID)
		w.processJob(job)
		msg.Ack(false)
	}

	return nil
}

func (w *Worker) processJob(job DeployJobEvent) {
	ctx := context.Background()

	// update status to deploying
	w.updateStatus(ctx, job.DeploymentID, "deploying")

	output, err := w.deployer.Deploy(ctx, ecsdeploy.DeployInput{
		DeploymentID: job.DeploymentID,
		ImageURI:     job.ImageURI,
		Port:         job.Port,
		CPU:          job.CPU,
		MemoryMB:     job.MemoryMB,
		HealthCheck:  job.HealthCheck,
		Subdomain:    job.Subdomain,
	})

	if err != nil {
		w.streamer.Publish(ctx, job.DeploymentID, fmt.Sprintf("✗ Deployment failed: %v", err))
		w.updateStatus(ctx, job.DeploymentID, "failed")
		log.Printf("deploy failed for %s: %v", job.DeploymentID, err)
		return
	}

	// update deployment record with live URL
	w.updateDeploymentLive(ctx, job.DeploymentID, job.ImageURI, output.ServiceARN, output.URL)
	w.streamer.Publish(ctx, job.DeploymentID, fmt.Sprintf("✓ Live at: http://%s", output.URL))
}

func (w *Worker) updateStatus(ctx context.Context, deploymentID, status string) {
	_, err := w.db.ExecContext(ctx,
		"UPDATE deployments SET status = $1 WHERE id = $2",
		status, deploymentID,
	)
	if err != nil {
		log.Printf("failed to update status: %v", err)
	}
}

func (w *Worker) updateDeploymentLive(ctx context.Context, deploymentID, imageURI, ecsARN, url string) {
	_, err := w.db.ExecContext(ctx,
		`UPDATE deployments SET 
			status = 'live',
			image_uri = $2,
			ecs_task_arn = $3,
			url = $4,
			deployed_at = now()
		WHERE id = $1`,
		deploymentID, imageURI, ecsARN, url,
	)
	if err != nil {
		log.Printf("failed to update deployment live: %v", err)
	}
}
