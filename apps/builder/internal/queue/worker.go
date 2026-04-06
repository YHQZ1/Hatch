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
	conn, err := amqp.Dial(w.url)
	if err != nil {
		return err
	}

	w.ch, err = conn.Channel()
	if err != nil {
		return err
	}

	// Declare both queues to ensure they exist before we try to publish/consume
	_, _ = w.ch.QueueDeclare("hatch.build.jobs", true, false, false, false, nil)
	_, _ = w.ch.QueueDeclare("hatch.deploy.jobs", true, false, false, false, nil)

	msgs, err := w.ch.Consume("hatch.build.jobs", "", false, false, false, false, nil)
	if err != nil {
		return err
	}

	log.Println("Builder worker listening for jobs...")

	for m := range msgs {
		var job BuildJobEvent
		if err := json.Unmarshal(m.Body, &job); err != nil {
			_ = m.Nack(false, false)
			continue
		}

		w.process(job)
		_ = m.Ack(false)
	}

	return nil
}

func (w *Worker) process(job BuildJobEvent) {
	ctx := context.Background()
	id := job.DeploymentID

	// Create a unique temp directory for this specific build
	buildPath := filepath.Join(os.TempDir(), "hatch-builds", id)
	defer os.RemoveAll(buildPath)

	w.streamer.Publish(ctx, id, fmt.Sprintf("→ Job Received: %s", id[:8]))
	w.streamer.Publish(ctx, id, "→ Syncing source code...")

	if err := gitpkg.Clone(ctx, job.RepoURL, job.UserToken, buildPath); err != nil {
		w.streamer.Publish(ctx, id, fmt.Sprintf("✗ Sync failed: %v", err))
		return
	}

	// Build and Push to ECR
	imageURI, err := w.builder.BuildAndPush(ctx, id, buildPath, job.DockerfilePath)
	if err != nil {
		w.streamer.Publish(ctx, id, fmt.Sprintf("✗ Build failed: %v", err))
		return
	}

	w.handoff(ctx, id, imageURI, int32(job.Port), job.Subdomain)
}

func (w *Worker) handoff(ctx context.Context, id, uri string, port int32, subdomain string) {
	w.streamer.Publish(ctx, id, "→ Triggering deployment orchestration...")

	event := DeployJobEvent{
		DeploymentID: id,
		ImageURI:     uri,
		CPU:          512,
		MemoryMB:     1024,
		Port:         port,
		HealthCheck:  "/",
		Subdomain:    subdomain,
	}

	body, _ := json.Marshal(event)
	err := w.ch.PublishWithContext(ctx, "", "hatch.deploy.jobs", false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         body,
	})

	if err != nil {
		w.streamer.Publish(ctx, id, "✗ Orchestration handoff failed")
		return
	}

	w.streamer.Publish(ctx, id, "✓ Pipeline stage complete: Build & Push")
}
