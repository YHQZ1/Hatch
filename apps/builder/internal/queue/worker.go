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

type Worker struct {
	rabbitmqURL string
	streamer    *logs.Streamer
	builder     *docker.Builder
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

	// declare queue (idempotent)
	q, err := ch.QueueDeclare(
		"hatch.build.jobs",
		true,  // durable
		false, // auto-delete
		false, // exclusive
		false, // no-wait
		nil,
	)
	if err != nil {
		return fmt.Errorf("failed to declare queue: %w", err)
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

	// build and push
	imageURI, err := w.builder.BuildAndPush(ctx, deploymentID, destDir)
	if err != nil {
		w.streamer.Publish(ctx, deploymentID, fmt.Sprintf("✗ Build failed: %v", err))
		log.Printf("build failed for %s: %v", deploymentID, err)
		return
	}

	w.streamer.Publish(ctx, deploymentID, fmt.Sprintf("✓ Build complete. Image: %s", imageURI))
	w.streamer.Publish(ctx, deploymentID, "→ Handing off to deployer service...")
}
