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
	defer conn.Close()

	w.ch, err = conn.Channel()
	if err != nil {
		return err
	}

	w.ch.QueueDeclare("hatch.build.jobs", true, false, false, false, nil)
	w.ch.QueueDeclare("hatch.deploy.jobs", true, false, false, false, nil)

	msgs, _ := w.ch.Consume("hatch.build.jobs", "", false, false, false, false, nil)

	log.Println("builder: listening for build jobs...")

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
	dest := filepath.Join(os.TempDir(), "hatch", id)
	defer os.RemoveAll(dest)

	w.streamer.Publish(ctx, id, fmt.Sprintf("→ Starting build: %s", id[:8]))
	w.streamer.Publish(ctx, id, fmt.Sprintf("→ Cloning %s...", job.RepoURL))

	if err := gitpkg.Clone(ctx, job.RepoURL, job.UserToken, dest); err != nil {
		w.streamer.Publish(ctx, id, "✗ Clone failed")
		return
	}

	uri, err := w.builder.BuildAndPush(ctx, id, dest, job.DockerfilePath)
	if err != nil {
		w.streamer.Publish(ctx, id, "✗ Build/Push failed")
		return
	}

	w.handoff(ctx, id, uri, int32(job.Port))
}

func (w *Worker) handoff(ctx context.Context, id, uri string, port int32) {
	w.streamer.Publish(ctx, id, "→ Handing off to deployer...")

	event := DeployJobEvent{
		DeploymentID: id,
		ImageURI:     uri,
		CPU:          512,
		MemoryMB:     1024,
		Port:         port,
		HealthCheck:  "/",
		Subdomain:    id[:8],
	}

	body, _ := json.Marshal(event)
	err := w.ch.PublishWithContext(ctx, "", "hatch.deploy.jobs", false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         body,
	})

	if err != nil {
		w.streamer.Publish(ctx, id, "✗ Handoff failed")
		return
	}

	w.streamer.Publish(ctx, id, "→ Deploy job queued")
}
