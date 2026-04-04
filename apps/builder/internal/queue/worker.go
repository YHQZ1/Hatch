package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/YHQZ1/hatch/apps/builder/internal/docker"
	gitpkg "github.com/YHQZ1/hatch/apps/builder/internal/git"
	"github.com/YHQZ1/hatch/apps/builder/internal/logs"
	amqp "github.com/rabbitmq/amqp091-go"
)

type BuildJobEvent struct {
	DeploymentID string `json:"deployment_id"`
	RepoURL      string `json:"repo_url"`
	Branch       string `json:"branch"`
	UserToken    string `json:"user_token"`
	Port         int    `json:"port"`
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
	rabbitmqURL string
	streamer    *logs.Streamer
	builder     *docker.Builder
	amqpCh      *amqp.Channel
}

func NewWorker(rabbitmqURL, redisURL, ecrRegistry, ecrRepo, awsRegion string) *Worker {
	streamer := logs.NewStreamer(redisURL)
	builder := docker.NewBuilder(ecrRegistry, ecrRepo, awsRegion, streamer)
	return &Worker{
		rabbitmqURL: rabbitmqURL,
		streamer:    streamer,
		builder:     builder,
	}
}

func (w *Worker) Start() error {
	conn, err := amqp.Dial(w.rabbitmqURL)
	if err != nil {
		return fmt.Errorf("failed to connect to rabbitmq: %w", err)
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		return fmt.Errorf("failed to open channel: %w", err)
	}
	defer ch.Close()

	w.amqpCh = ch

	// declare build queue
	q, err := ch.QueueDeclare(
		"hatch.build.jobs",
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return fmt.Errorf("failed to declare build queue: %w", err)
	}

	// declare deploy queue (so it exists before we publish to it)
	_, err = ch.QueueDeclare(
		"hatch.deploy.jobs",
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return fmt.Errorf("failed to declare deploy queue: %w", err)
	}

	msgs, err := ch.Consume(q.Name, "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("failed to consume: %w", err)
	}

	log.Printf("builder worker ready — listening on %s", q.Name)

	for msg := range msgs {
		var job BuildJobEvent
		if err := json.Unmarshal(msg.Body, &job); err != nil {
			log.Printf("failed to parse job: %v", err)
			msg.Nack(false, false)
			continue
		}

		log.Printf("received build job for deployment %s", job.DeploymentID)
		w.processJob(job)
		msg.Ack(false)
	}

	return nil
}

func (w *Worker) processJob(job BuildJobEvent) {
	ctx := context.Background()
	deploymentID := job.DeploymentID

	w.streamer.Publish(ctx, deploymentID, fmt.Sprintf("→ Starting build for deployment %s", deploymentID[:8]))
	w.streamer.Publish(ctx, deploymentID, fmt.Sprintf("→ Cloning %s (branch: %s)...", job.RepoURL, job.Branch))

	// clone repo to temp dir
	destDir := filepath.Join(os.TempDir(), "hatch-builds", deploymentID)
	defer os.RemoveAll(destDir)

	if err := gitpkg.Clone(ctx, job.RepoURL, job.UserToken, destDir); err != nil {
		w.streamer.Publish(ctx, deploymentID, fmt.Sprintf("✗ Clone failed: %v", err))
		log.Printf("clone failed for %s: %v", deploymentID, err)
		return
	}

	w.streamer.Publish(ctx, deploymentID, "✓ Repository cloned")

	// build and push to ECR
	imageURI, err := w.builder.BuildAndPush(ctx, deploymentID, destDir)
	if err != nil {
		w.streamer.Publish(ctx, deploymentID, fmt.Sprintf("✗ Build failed: %v", err))
		log.Printf("build failed for %s: %v", deploymentID, err)
		return
	}

	w.streamer.Publish(ctx, deploymentID, fmt.Sprintf("✓ Build complete. Image: %s", imageURI))
	w.streamer.Publish(ctx, deploymentID, "→ Handing off to deployer service...")

	// publish deploy job to hatch.deploy.jobs
	deployJob := DeployJobEvent{
		DeploymentID: deploymentID,
		ImageURI:     imageURI,
		CPU:          512,
		MemoryMB:     1024,
		Port:         int32(job.Port),
		HealthCheck:  "/",
		Subdomain:    deploymentID[:8],
	}

	body, err := json.Marshal(deployJob)
	if err != nil {
		log.Printf("failed to marshal deploy job: %v", err)
		return
	}

	if err := w.amqpCh.PublishWithContext(ctx,
		"",
		"hatch.deploy.jobs",
		false,
		false,
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Body:         body,
		},
	); err != nil {
		w.streamer.Publish(ctx, deploymentID, fmt.Sprintf("✗ Failed to queue deploy job: %v", err))
		log.Printf("failed to publish deploy job: %v", err)
		return
	}

	w.streamer.Publish(ctx, deploymentID, "→ Deploy job queued")
	log.Printf("deploy job queued for deployment %s", deploymentID)
}
