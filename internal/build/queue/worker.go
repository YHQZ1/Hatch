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
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/YHQZ1/hatch/internal/build/docker"
	gitpkg "github.com/YHQZ1/hatch/internal/build/git"
	"github.com/YHQZ1/hatch/internal/build/logs"
	"github.com/YHQZ1/hatch/internal/githubapp"
	"github.com/YHQZ1/hatch/internal/secrets"
	_ "github.com/jackc/pgx/v5/stdlib"
	amqp "github.com/rabbitmq/amqp091-go"
)

type BuildJobEvent struct {
	DeploymentID   string `json:"deployment_id"`
	RepoURL        string `json:"repo_url"`
	Branch         string `json:"branch"`
	DockerfilePath string `json:"dockerfile_path"`
	UserID         string `json:"user_id"`
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
	url         string
	streamer    *logs.Streamer
	builder     *docker.Builder
	db          *sql.DB
	ch          *amqp.Channel
	conn        *amqp.Connection
	confirms    <-chan amqp.Confirmation
	secrets     *secrets.Codec
	cloneTokens CloneTokenSource
	stages      sync.Map
	timeout     time.Duration
	consumerTag string
	mu          sync.Mutex
	stopped     atomic.Bool
	stopCh      chan struct{}
	stopOnce    sync.Once
}

// CloneTokenSource gives a token that can read one GitHub repository. It is
// satisfied by *githubapp.App.
type CloneTokenSource interface {
	InstallationToken(ctx context.Context, owner, name string) (string, error)
}

func NewWorker(url, redis, registry, repo, region, databaseURL, encryptionKey string, buildTimeout time.Duration, cloneTokens CloneTokenSource) *Worker {
	streamer := logs.NewStreamer(redis)
	secretCodec, err := secrets.NewCodec(encryptionKey)
	if err != nil {
		log.Fatalf("Failed to initialize secret codec: %v", err)
	}
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	db.SetConnMaxIdleTime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	worker := &Worker{
		url:      url,
		streamer: streamer,
		db:       db,
		secrets:  secretCodec,
		timeout:  buildTimeout,
		stopCh:   make(chan struct{}),

		cloneTokens: cloneTokens,
	}

	worker.builder = docker.NewBuilder(registry, repo, region, streamer, worker.setStage)

	return worker
}

func (w *Worker) Start() error {
	backoff := time.Second
	for {
		if w.stopped.Load() {
			return nil
		}

		err := w.runOnce()
		if w.stopped.Load() {
			return nil
		}
		if err != nil {
			log.Printf("Builder worker disconnected: %v", err)
		}

		if w.channel() != nil {
			backoff = time.Second
		}
		select {
		case <-w.stopCh:
			return nil
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

func (w *Worker) runOnce() error {
	if err := w.connect(); err != nil {
		return err
	}

	msgs, err := w.ch.Consume("hatch.build.jobs", w.consumerTag, false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("failed to start consumer: %w", err)
	}

	log.Println("Builder worker started")

	for m := range msgs {
		var job BuildJobEvent
		if err := json.Unmarshal(m.Body, &job); err != nil {
			log.Printf("Dropping malformed build job: %v", err)
			if err := m.Nack(false, false); err != nil {
				log.Printf("Failed to nack malformed build job: %v", err)
			}
			continue
		}

		if err := validateBuildJob(job); err != nil {
			log.Printf("Dropping invalid build job %q: %v", job.DeploymentID, err)
			if job.DeploymentID != "" {
				w.streamer.Publish(context.Background(), job.DeploymentID, fmt.Sprintf("Build job rejected: %v", err))
				w.markDeploymentFailed(context.Background(), job.DeploymentID, "builder_validation", err)
			}
			if err := m.Ack(false); err != nil {
				return fmt.Errorf("failed to ack invalid build job: %w", err)
			}
			continue
		}

		w.process(job)
		if err := m.Ack(false); err != nil {
			return fmt.Errorf("failed to ack build job: %w", err)
		}
	}

	return fmt.Errorf("build consumer channel closed")
}

func (w *Worker) connect() error {
	w.closeRabbit()

	conn, err := amqp.DialConfig(w.url, amqp.Config{
		Dial:      amqp.DefaultDial(5 * time.Second),
		Heartbeat: 10 * time.Second,
	})
	if err != nil {
		return fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("failed to open channel: %w", err)
	}
	if err := ch.Confirm(false); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return fmt.Errorf("failed to enable RabbitMQ publisher confirms: %w", err)
	}
	if err := ch.Qos(1, 0, false); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return fmt.Errorf("failed to configure build queue qos: %w", err)
	}

	for _, queueName := range []string{"hatch.build.jobs", "hatch.deploy.jobs"} {
		if _, err := ch.QueueDeclare(queueName, true, false, false, false, nil); err != nil {
			_ = ch.Close()
			_ = conn.Close()
			return fmt.Errorf("failed to declare queue %s: %w", queueName, err)
		}
	}

	w.mu.Lock()
	w.conn = conn
	w.ch = ch
	w.confirms = ch.NotifyPublish(make(chan amqp.Confirmation, 1))
	w.consumerTag = fmt.Sprintf("hatch-builder-%d", time.Now().UnixNano())
	w.mu.Unlock()

	return nil
}

func (w *Worker) Stop() {
	w.stopped.Store(true)
	w.stopOnce.Do(func() {
		close(w.stopCh)
	})

	w.mu.Lock()
	ch := w.ch
	tag := w.consumerTag
	conn := w.conn
	w.mu.Unlock()

	if ch != nil && tag != "" {
		if err := ch.Cancel(tag, false); err != nil && !errors.Is(err, amqp.ErrClosed) {
			log.Printf("Failed to cancel builder consumer: %v", err)
		}
	}
	if conn != nil {
		_ = conn.Close()
	}
}

func (w *Worker) closeRabbit() {
	w.mu.Lock()
	ch := w.ch
	conn := w.conn
	w.ch = nil
	w.conn = nil
	w.confirms = nil
	w.consumerTag = ""
	w.mu.Unlock()

	if ch != nil {
		_ = ch.Close()
	}
	if conn != nil {
		_ = conn.Close()
	}
}

func validateBuildJob(job BuildJobEvent) error {
	if strings.TrimSpace(job.DeploymentID) == "" {
		return fmt.Errorf("deployment_id is required")
	}
	if strings.TrimSpace(job.RepoURL) == "" {
		return fmt.Errorf("repo_url is required")
	}
	if job.Port <= 0 || job.Port > 65535 {
		return fmt.Errorf("port must be between 1 and 65535")
	}
	if job.CPU <= 0 {
		return fmt.Errorf("cpu must be greater than zero")
	}
	if job.MemoryMB <= 0 {
		return fmt.Errorf("memory_mb must be greater than zero")
	}
	if len(job.DockerfilePath) > 512 {
		return fmt.Errorf("dockerfile_path is too long")
	}
	if strings.Contains(job.DockerfilePath, "\x00") {
		return fmt.Errorf("dockerfile_path contains invalid characters")
	}
	return nil
}

func (w *Worker) process(job BuildJobEvent) {
	ctx, cancelTimeout := context.WithTimeout(context.Background(), w.timeout)
	defer cancelTimeout()
	ctx, cancel := context.WithCancel(ctx)
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

	buildPath := filepath.Join(os.TempDir(), "hatch-builds", safePathSegment(id))
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

	cloneToken, err := w.cloneToken(ctx, job)
	if err != nil {
		w.streamer.Publish(ctx, id, fmt.Sprintf("Auth failed: %v", err))
		w.markDeploymentFailed(context.Background(), id, "auth", err)
		return
	}

	if err := gitpkg.Clone(ctx, job.RepoURL, cloneToken, job.Branch, buildPath); err != nil {
		if w.markTimedOut(ctx, id) {
			return
		}
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
		if w.markTimedOut(ctx, id) {
			return
		}
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
		if w.markTimedOut(ctx, id) {
			return
		}
		w.streamer.Publish(ctx, id, err.Error())
		w.markDeploymentFailed(context.Background(), id, "handoff", err)
	}
}

func (w *Worker) markTimedOut(ctx context.Context, deploymentID string) bool {
	if !errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return false
	}
	err := fmt.Errorf("build exceeded timeout of %s", w.timeout)
	w.streamer.Publish(context.Background(), deploymentID, "Build timed out")
	w.markDeploymentFailed(context.Background(), deploymentID, "timeout", err)
	return true
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
		return fmt.Errorf("marshal deploy job: %w", err)
	}

	if err := w.publishDeployJob(ctx, body); err != nil {
		return fmt.Errorf("hand off to deployer: %w", err)
	}

	w.streamer.Publish(ctx, job.DeploymentID, "Pipeline stage complete: Build and Push")
	return nil
}

func (w *Worker) publishDeployJob(ctx context.Context, body []byte) error {
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		ch := w.channel()
		if ch == nil {
			return fmt.Errorf("rabbitmq channel unavailable")
		}

		err := ch.PublishWithContext(ctx, "", "hatch.deploy.jobs", true, false, amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Body:         body,
		})
		if err != nil {
			if ctx.Err() != nil {
				return err
			}
			lastErr = err
			time.Sleep(time.Duration(attempt) * 150 * time.Millisecond)
			continue
		}
		if err := w.waitForPublishConfirm(ctx, "hatch.deploy.jobs"); err != nil {
			if isAmbiguousPublishError(err) || ctx.Err() != nil {
				return err
			}
			lastErr = err
			time.Sleep(time.Duration(attempt) * 150 * time.Millisecond)
			continue
		}
		return nil
	}

	return lastErr
}

func (w *Worker) waitForPublishConfirm(ctx context.Context, queueName string) error {
	confirms := w.confirmations()
	if confirms == nil {
		return fmt.Errorf("rabbitmq confirmation channel closed")
	}

	timeout := time.NewTimer(10 * time.Second)
	defer timeout.Stop()

	select {
	case confirm, ok := <-confirms:
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

func isAmbiguousPublishError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "timed out waiting for rabbitmq publish confirmation") ||
		strings.Contains(msg, "rabbitmq confirmation channel closed")
}

// cloneToken returns a short-lived token that can read only the job's
// repository. It comes from the Hatch GitHub App's installation, so a build
// never holds the user's own GitHub credentials (ADR 0010).
func (w *Worker) cloneToken(ctx context.Context, job BuildJobEvent) (string, error) {
	owner, name, err := githubapp.ParseRepoURL(job.RepoURL)
	if err != nil {
		return "", err
	}
	token, err := w.cloneTokens.InstallationToken(ctx, owner, name)
	if errors.Is(err, githubapp.ErrNotInstalled) {
		return "", fmt.Errorf("the Hatch GitHub App is not installed on %s/%s; install it on the repository and deploy again", owner, name)
	}
	if err != nil {
		return "", fmt.Errorf("could not get access to %s/%s: %w", owner, name, err)
	}
	return strings.TrimSpace(token), nil
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
	ctx, cancel := boundedContext(ctx, 2*time.Second)
	defer cancel()

	var status string
	err := w.db.QueryRowContext(ctx, "SELECT status FROM deployments WHERE id = $1", deploymentID).Scan(&status)
	return err == nil && status == "canceled"
}

func (w *Worker) markDeploymentFailed(ctx context.Context, deploymentID, stage string, cause error) {
	ctx, cancel := boundedContext(ctx, 5*time.Second)
	defer cancel()

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
	ctx, cancel := boundedContext(ctx, 5*time.Second)
	defer cancel()

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

func boundedContext(parent context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	if _, ok := parent.Deadline(); ok {
		return context.WithCancel(parent)
	}
	return context.WithTimeout(parent, timeout)
}

func shortDeploymentID(id string) string {
	if len(id) <= 8 {
		return id
	}
	return id[:8]
}

func safePathSegment(value string) string {
	cleaned := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= 'A' && r <= 'Z':
			return r
		case r >= '0' && r <= '9':
			return r
		case r == '-', r == '_', r == '.':
			return r
		default:
			return '-'
		}
	}, strings.TrimSpace(value))
	cleaned = strings.Trim(cleaned, ".-")
	if cleaned == "" {
		return fmt.Sprintf("deployment-%d", time.Now().UnixNano())
	}
	return cleaned
}

func (w *Worker) channel() *amqp.Channel {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.ch
}

func (w *Worker) confirmations() <-chan amqp.Confirmation {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.confirms
}

func (w *Worker) Close() {
	if w.db != nil {
		w.db.Close()
	}
	w.closeRabbit()
}
