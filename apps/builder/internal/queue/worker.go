package queue

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/YHQZ1/hatch/apps/builder/internal/docker"
	gitpkg "github.com/YHQZ1/hatch/apps/builder/internal/git"
	"github.com/YHQZ1/hatch/apps/builder/internal/logs"
	_ "github.com/lib/pq"
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
	db       *sql.DB
	ch       *amqp.Channel
	conn     *amqp.Connection
	confirms <-chan amqp.Confirmation
	stages   sync.Map
}

func NewWorker(url, redis, registry, repo, region, databaseURL string) *Worker {
	streamer := logs.NewStreamer(redis)
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	worker := &Worker{
		url:      url,
		streamer: streamer,
		db:       db,
	}

	worker.builder = docker.NewBuilder(registry, repo, region, streamer, worker.setStage)

	return worker
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
	if err := w.ch.Confirm(false); err != nil {
		return fmt.Errorf("failed to enable RabbitMQ publisher confirms: %w", err)
	}
	w.confirms = w.ch.NotifyPublish(make(chan amqp.Confirmation, 1))

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
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	id := job.DeploymentID
	defer func() {
		if r := recover(); r != nil {
			err := fmt.Errorf("builder panic: %v", r)
			log.Printf("Builder panic while processing deployment %s: %v", id, r)
			w.streamer.Publish(context.Background(), id, fmt.Sprintf("Build failed: %v", err))
			w.markDeploymentFailed(context.Background(), id, "builder", err)
		}
	}()

	buildPath := filepath.Join(os.TempDir(), "hatch-builds", id)
	defer os.RemoveAll(buildPath)
	defer w.clearStage(id)

	stopWatch := w.watchCancellation(ctx, id, cancel)
	defer stopWatch()

	w.streamer.Publish(ctx, id, fmt.Sprintf("Job received: %s", shortDeploymentID(id)))
	w.streamer.Publish(ctx, id, "Syncing source code...")
	w.updateDeploymentStatus(context.Background(), id, "building")

	if w.isCanceled(context.Background(), id) {
		w.streamer.Publish(ctx, id, "Deployment canceled before source sync")
		return
	}

	if err := gitpkg.Clone(ctx, job.RepoURL, job.UserToken, job.Branch, buildPath); err != nil {
		if errors.Is(err, context.Canceled) && w.isCanceled(context.Background(), id) {
			w.streamer.Publish(context.Background(), id, "Build canceled during source sync")
			return
		}
		w.streamer.Publish(ctx, id, fmt.Sprintf("Sync failed: %v", err))
		w.markDeploymentFailed(context.Background(), id, "source_sync", err)
		return
	}

	if w.isCanceled(context.Background(), id) {
		w.streamer.Publish(context.Background(), id, "Deployment canceled before Docker build")
		return
	}

	imageURI, err := w.builder.BuildAndPush(ctx, id, buildPath, job.DockerfilePath)
	if err != nil {
		if errors.Is(err, docker.ErrCanceled) || (errors.Is(err, context.Canceled) && w.isCanceled(context.Background(), id)) {
			w.publishCancellation(context.Background(), id, err)
			return
		}
		w.streamer.Publish(ctx, id, fmt.Sprintf("Build failed: %v", err))
		w.markDeploymentFailed(context.Background(), id, "build", err)
		return
	}

	if w.isCanceled(context.Background(), id) {
		w.streamer.Publish(context.Background(), id, "Deployment canceled before deploy handoff")
		return
	}

	if err := w.handoff(ctx, job, imageURI); err != nil {
		w.streamer.Publish(ctx, id, err.Error())
		w.markDeploymentFailed(context.Background(), id, "handoff", err)
	}
}

func (w *Worker) handoff(ctx context.Context, job BuildJobEvent, uri string) error {
	if w.isCanceled(context.Background(), job.DeploymentID) {
		w.streamer.Publish(context.Background(), job.DeploymentID, "Deployment canceled before orchestration handoff")
		return nil
	}

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
		return fmt.Errorf("Failed to marshal deploy job: %v", err)
	}

	err = w.ch.PublishWithContext(ctx, "", "hatch.deploy.jobs", true, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         body,
	})

	if err != nil {
		return fmt.Errorf("Orchestration handoff failed: %v", err)
	}
	if err := w.waitForPublishConfirm(ctx, "hatch.deploy.jobs"); err != nil {
		return fmt.Errorf("Orchestration handoff failed: %v", err)
	}

	w.streamer.Publish(ctx, job.DeploymentID, "Pipeline stage complete: Build and Push")
	return nil
}

func (w *Worker) waitForPublishConfirm(ctx context.Context, queueName string) error {
	timeout := time.NewTimer(10 * time.Second)
	defer timeout.Stop()

	select {
	case confirm, ok := <-w.confirms:
		if !ok {
			return fmt.Errorf("rabbitmq confirmation channel closed")
		}
		if !confirm.Ack {
			return fmt.Errorf("rabbitmq rejected publish to %s", queueName)
		}
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-timeout.C:
		return fmt.Errorf("timed out waiting for rabbitmq publish confirmation")
	}
}

func (w *Worker) watchCancellation(ctx context.Context, deploymentID string, cancel context.CancelFunc) func() {
	stop := make(chan struct{})

	go func() {
		ticker := time.NewTicker(250 * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-stop:
				return
			case <-ticker.C:
				if w.isCanceled(context.Background(), deploymentID) {
					w.publishCancellationDetected(context.Background(), deploymentID)
					cancel()
					return
				}
			}
		}
	}()

	return func() {
		close(stop)
	}
}

func (w *Worker) setStage(deploymentID string, stage docker.CancelStage) {
	w.stages.Store(deploymentID, stage)
}

func (w *Worker) clearStage(deploymentID string) {
	w.stages.Delete(deploymentID)
}

func (w *Worker) stage(deploymentID string) (docker.CancelStage, bool) {
	stage, ok := w.stages.Load(deploymentID)
	if !ok {
		return "", false
	}

	cancelStage, ok := stage.(docker.CancelStage)
	return cancelStage, ok
}

func (w *Worker) publishCancellationDetected(ctx context.Context, deploymentID string) {
	stage, ok := w.stage(deploymentID)
	if !ok {
		return
	}

	switch stage {
	case docker.CancelStageDuringDockerBuild:
		w.streamer.Publish(ctx, deploymentID, "Cancellation detected during Docker build; waiting for Docker to stop")
	case docker.CancelStageDuringECRAuth:
		w.streamer.Publish(ctx, deploymentID, "Cancellation detected during ECR authentication")
	case docker.CancelStageDuringDockerPush:
		w.streamer.Publish(ctx, deploymentID, "Cancellation detected during docker push; waiting for Docker to stop")
	case docker.CancelStageAfterDockerPush:
		w.streamer.Publish(ctx, deploymentID, "Build canceled after image push; skipping deploy handoff")
	}
}

func (w *Worker) publishCancellation(ctx context.Context, deploymentID string, err error) {
	var canceledErr *docker.CanceledError
	if errors.As(err, &canceledErr) {
		switch canceledErr.Stage() {
		case docker.CancelStageBeforeDockerBuild:
			w.streamer.Publish(ctx, deploymentID, "Deployment canceled before Docker build")
		case docker.CancelStageDuringDockerBuild:
			w.streamer.Publish(ctx, deploymentID, "Build canceled during Docker build")
		case docker.CancelStageBeforeECRAuth:
			w.streamer.Publish(ctx, deploymentID, "Cancellation detected before ECR authentication")
		case docker.CancelStageDuringECRAuth:
			w.streamer.Publish(ctx, deploymentID, "Build canceled during ECR authentication")
		case docker.CancelStageBeforeDockerPush:
			w.streamer.Publish(ctx, deploymentID, "Cancellation detected before docker push")
		case docker.CancelStageDuringDockerPush:
			w.streamer.Publish(ctx, deploymentID, "Build canceled during docker push")
		case docker.CancelStageAfterDockerPush:
			w.streamer.Publish(ctx, deploymentID, "Build canceled after image push; skipping deploy handoff")
		default:
			w.streamer.Publish(ctx, deploymentID, "Build canceled before image handoff")
		}
		return
	}

	w.streamer.Publish(ctx, deploymentID, "Build canceled before image handoff")
}

func (w *Worker) isCanceled(ctx context.Context, deploymentID string) bool {
	var status string
	err := w.db.QueryRowContext(ctx, "SELECT status FROM deployments WHERE id = $1", deploymentID).Scan(&status)
	return err == nil && status == "canceled"
}

func (w *Worker) markDeploymentFailed(ctx context.Context, deploymentID, stage string, cause error) {
	_, err := w.db.ExecContext(
		ctx,
		`
			UPDATE deployments
			SET status = 'failed',
			    error_stage = $2,
			    error_message = $3,
			    failed_at = now()
			WHERE id = $1 AND status <> 'canceled'`,
		deploymentID,
		stage,
		cause.Error(),
	)
	if err != nil {
		log.Printf("Failed to mark deployment failed for %s: %v", deploymentID, err)
	}
}

func (w *Worker) updateDeploymentStatus(ctx context.Context, deploymentID, status string) {
	_, err := w.db.ExecContext(
		ctx,
		`
			UPDATE deployments
			SET status = $2,
			    error_stage = NULL,
			    error_message = NULL,
			    failed_at = NULL
			WHERE id = $1 AND status <> 'canceled'`,
		deploymentID,
		status,
	)
	if err != nil {
		log.Printf("Failed to update deployment status for %s: %v", deploymentID, err)
	}
}

func shortDeploymentID(id string) string {
	if len(id) <= 8 {
		return id
	}
	return id[:8]
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
