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
	DeploymentID   string `json:"deployment_id"`
	RepoURL        string `json:"repo_url"`
	Branch         string `json:"branch"`
	DockerfilePath string `json:"dockerfile_path"`
	UserToken      string `json:"user_token"`
	Port           int    `json:"port"`
	Subdomain      string `json:"subdomain"`
	CPU            int32  `json:"cpu"`
	MemoryMB       int32  `json:"memory_mb"`
	HealthCheck    string `json:"health_check"`
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
	url      string
	streamer *logs.Streamer
	builder  *docker.Builder
	ch       *amqp.Channel
	conn     *amqp.Connection
}

func NewWorker(url, redis, registry, repo, region string) *Worker {
	streamer := logs.NewStreamer(redis)
	return &Worker{
		url:      url,
		streamer: streamer,
		builder:  docker.NewBuilder(registry, repo, region, streamer),
	}
}

func (w *Worker) Start() error {
	var err error
	w.conn, err = amqp.Dial(w.url)
	if err != nil {
		return fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	w.ch, err = w.conn.Channel()
	if err != nil {
		return fmt.Errorf("failed to open channel: %w", err)
	}

	_, err = w.ch.QueueDeclare("hatch.build.jobs", true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("failed to declare build queue: %w", err)
	}

	_, err = w.ch.QueueDeclare("hatch.deploy.jobs", true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("failed to declare deploy queue: %w", err)
	}

	msgs, err := w.ch.Consume("hatch.build.jobs", "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("failed to start consumer: %w", err)
	}

	log.Println("Builder worker started")

	for m := range msgs {
		var job BuildJobEvent
		if err := json.Unmarshal(m.Body, &job); err != nil {
			m.Nack(false, false)
			continue
		}

		w.process(job)
		m.Ack(false)
	}

	return nil
}

func (w *Worker) process(job BuildJobEvent) {
	ctx := context.Background()
	id := job.DeploymentID

	buildPath := filepath.Join(os.TempDir(), "hatch-builds", id)
	defer os.RemoveAll(buildPath)

	w.streamer.Publish(ctx, id, fmt.Sprintf("Job received: %s", id[:8]))
	w.streamer.Publish(ctx, id, "Syncing source code...")

	if err := gitpkg.Clone(ctx, job.RepoURL, job.UserToken, buildPath); err != nil {
		w.streamer.Publish(ctx, id, fmt.Sprintf("Sync failed: %v", err))
		return
	}

	imageURI, err := w.builder.BuildAndPush(ctx, id, buildPath, job.DockerfilePath)
	if err != nil {
		w.streamer.Publish(ctx, id, fmt.Sprintf("Build failed: %v", err))
		return
	}

	w.handoff(ctx, job, imageURI)
}

func (w *Worker) handoff(ctx context.Context, job BuildJobEvent, uri string) {
	w.streamer.Publish(ctx, job.DeploymentID, "Triggering deployment orchestration...")

	event := DeployJobEvent{
		DeploymentID: job.DeploymentID,
		ImageURI:     uri,
		CPU:          job.CPU,
		MemoryMB:     job.MemoryMB,
		Port:         int32(job.Port),
		HealthCheck:  job.HealthCheck,
		Subdomain:    job.Subdomain,
	}

	body, err := json.Marshal(event)
	if err != nil {
		w.streamer.Publish(ctx, job.DeploymentID, fmt.Sprintf("Failed to marshal deploy job: %v", err))
		return
	}

	err = w.ch.PublishWithContext(ctx, "", "hatch.deploy.jobs", false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         body,
	})

	if err != nil {
		w.streamer.Publish(ctx, job.DeploymentID, fmt.Sprintf("Orchestration handoff failed: %v", err))
		return
	}

	w.streamer.Publish(ctx, job.DeploymentID, "Pipeline stage complete: Build and Push")
}

func (w *Worker) Close() {
	if w.ch != nil {
		w.ch.Close()
	}
	if w.conn != nil {
		w.conn.Close()
	}
}
