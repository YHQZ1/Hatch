package queue

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	ecsdeploy "github.com/YHQZ1/hatch/internal/runtime/ecs"
	"github.com/YHQZ1/hatch/internal/runtime/logs"
	"github.com/YHQZ1/hatch/internal/secrets"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ecr"
	ecrtypes "github.com/aws/aws-sdk-go-v2/service/ecr/types"
	_ "github.com/jackc/pgx/v5/stdlib"
	amqp "github.com/rabbitmq/amqp091-go"
)

type Config struct {
	RabbitMQURL          string
	RedisURL             string
	AWSRegion            string
	ECSClusterName       string
	ALBListenerARN       string
	PublicURLScheme      string
	VPCID                string
	SubnetA              string
	SubnetB              string
	ECSSgID              string
	TaskExecutionRoleARN string
	DatabaseURL          string
	BaseDomain           string
	DataEncryptionKey    string
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

type CleanupJobEvent struct {
	ProjectID string `json:"project_id"`
	Slug      string `json:"slug"`
}

type ServiceControlJobEvent struct {
	ProjectID string `json:"project_id"`
	Slug      string `json:"slug"`
	Action    string `json:"action"`
}

type Worker struct {
	cfg       Config
	streamer  *logs.Streamer
	deployer  *ecsdeploy.Deployer
	db        *sql.DB
	conn      *amqp.Connection
	consumers []queueConsumer
	secrets   *secrets.Codec
	ecr       *ecr.Client
	mu        sync.Mutex
	stopped   atomic.Bool
	stopCh    chan struct{}
	stopOnce  sync.Once
}

type queueConsumer struct {
	name string
	tag  string
	ch   *amqp.Channel
}

func NewWorker(cfg Config) *Worker {
	secretCodec, err := secrets.NewCodec(cfg.DataEncryptionKey)
	if err != nil {
		log.Fatalf("Failed to initialize secret codec: %v", err)
	}

	db, err := sql.Open("pgx", cfg.DatabaseURL)
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
	awsCfg, err := config.LoadDefaultConfig(context.Background(), config.WithRegion(cfg.AWSRegion))
	if err != nil {
		log.Fatalf("Failed to load AWS config: %v", err)
	}

	streamer := logs.NewStreamer(cfg.RedisURL)
	deployer := ecsdeploy.NewDeployer(
		cfg.AWSRegion, cfg.ECSClusterName, cfg.ALBListenerARN,
		cfg.VPCID, cfg.SubnetA, cfg.SubnetB, cfg.ECSSgID,
		cfg.TaskExecutionRoleARN, cfg.BaseDomain, cfg.PublicURLScheme, streamer,
	)

	worker := &Worker{
		cfg:      cfg,
		streamer: streamer,
		deployer: deployer,
		db:       db,
		secrets:  secretCodec,
		ecr:      ecr.NewFromConfig(awsCfg),
		stopCh:   make(chan struct{}),
	}
	deployer.SetCancelChecker(worker.isDeploymentCanceled)

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
			log.Printf("Deployer worker disconnected: %v", err)
		}

		if w.connection() != nil {
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

	deployMsgs, err := w.consumeQueue("hatch.deploy.jobs")
	if err != nil {
		return err
	}
	cleanupMsgs, err := w.consumeQueue("hatch.cleanup.jobs")
	if err != nil {
		return err
	}
	serviceMsgs, err := w.consumeQueue("hatch.service.jobs")
	if err != nil {
		return err
	}
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		w.handleCleanupJobs(cleanupMsgs)
	}()
	go func() {
		defer wg.Done()
		w.handleServiceControlJobs(serviceMsgs)
	}()

	log.Println("Deployer worker started")

	for msg := range deployMsgs {
		var job DeployJobEvent
		if err := json.Unmarshal(msg.Body, &job); err != nil {
			log.Printf("Dropping malformed deploy job: %v", err)
			if err := msg.Nack(false, false); err != nil {
				log.Printf("Failed to nack malformed deploy job: %v", err)
			}
			continue
		}
		if err := validateDeployJob(job); err != nil {
			log.Printf("Dropping invalid deploy job %q: %v", job.DeploymentID, err)
			if job.DeploymentID != "" {
				w.streamer.Publish(context.Background(), job.DeploymentID, fmt.Sprintf("Deploy job rejected: %v", err))
				w.markDeploymentFailed(context.Background(), job.DeploymentID, "deployer_validation", err)
			}
			if err := msg.Ack(false); err != nil {
				return fmt.Errorf("failed to ack invalid deploy job: %w", err)
			}
			continue
		}

		w.processJob(job)
		if err := msg.Ack(false); err != nil {
			return fmt.Errorf("failed to ack deploy job: %w", err)
		}
	}

	wg.Wait()
	return fmt.Errorf("deploy consumer channel closed")
}

func (w *Worker) connect() error {
	w.closeRabbit()

	conn, err := amqp.DialConfig(w.cfg.RabbitMQURL, amqp.Config{
		Dial:      amqp.DefaultDial(5 * time.Second),
		Heartbeat: 10 * time.Second,
	})
	if err != nil {
		return fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	w.mu.Lock()
	w.conn = conn
	w.consumers = nil
	w.mu.Unlock()
	return nil
}

func (w *Worker) consumeQueue(queueName string) (<-chan amqp.Delivery, error) {
	conn := w.connection()
	if conn == nil {
		return nil, fmt.Errorf("rabbitmq connection unavailable")
	}
	ch, err := conn.Channel()
	if err != nil {
		return nil, fmt.Errorf("failed to open RabbitMQ channel for %s: %w", queueName, err)
	}
	consumerTag := "hatch-deployer-" + strings.ReplaceAll(queueName, ".", "-")
	w.mu.Lock()
	w.consumers = append(w.consumers, queueConsumer{name: queueName, tag: consumerTag, ch: ch})
	w.mu.Unlock()

	_, err = ch.QueueDeclare(queueName, true, false, false, false, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to declare %s: %w", queueName, err)
	}
	if err := ch.Qos(1, 0, false); err != nil {
		return nil, fmt.Errorf("failed to set qos for %s: %w", queueName, err)
	}

	msgs, err := ch.Consume(queueName, consumerTag, false, false, false, false, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to consume %s: %w", queueName, err)
	}
	return msgs, nil
}

func (w *Worker) Stop() {
	w.stopped.Store(true)
	w.stopOnce.Do(func() {
		close(w.stopCh)
	})

	w.mu.Lock()
	consumers := append([]queueConsumer(nil), w.consumers...)
	conn := w.conn
	w.mu.Unlock()

	for _, consumer := range consumers {
		if consumer.ch == nil || consumer.tag == "" {
			continue
		}
		if err := consumer.ch.Cancel(consumer.tag, false); err != nil && !errors.Is(err, amqp.ErrClosed) {
			log.Printf("Failed to cancel deployer consumer %s: %v", consumer.name, err)
		}
	}
	if conn != nil {
		_ = conn.Close()
	}
}

func (w *Worker) handleServiceControlJobs(msgs <-chan amqp.Delivery) {
	for msg := range msgs {
		var job ServiceControlJobEvent
		if err := json.Unmarshal(msg.Body, &job); err != nil {
			log.Printf("Dropping malformed service control job: %v", err)
			if err := msg.Nack(false, false); err != nil {
				log.Printf("Failed to nack malformed service control job: %v", err)
			}
			continue
		}
		if err := validateServiceControlJob(job); err != nil {
			log.Printf("Dropping invalid service control job for project %q: %v", job.ProjectID, err)
			if job.ProjectID != "" {
				w.markProjectOperationFailed(context.Background(), job.ProjectID, "service_control_failed", err)
			}
			if err := msg.Ack(false); err != nil {
				log.Printf("Failed to ack invalid service control job: %v", err)
			}
			continue
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		var desiredCount int32
		var successStatus, failedStatus string
		switch job.Action {
		case "suspend":
			desiredCount = 0
			successStatus = "suspended"
			failedStatus = "suspend_failed"
		case "resume":
			desiredCount = 1
			successStatus = "active"
			failedStatus = "resume_failed"
		default:
			cancel()
			if err := msg.Ack(false); err != nil {
				log.Printf("Failed to ack unsupported service control job: %v", err)
			}
			continue
		}

		if err := w.deployer.SetServiceDesiredCount(ctx, job.Slug, desiredCount); err != nil {
			log.Printf("Failed to %s %s: %v", job.Action, job.Slug, err)
			w.markProjectOperationFailed(ctx, job.ProjectID, failedStatus, err)
			cancel()
			if err := msg.Ack(false); err != nil {
				log.Printf("Failed to ack failed service control job: %v", err)
			}
			continue
		}

		w.updateProjectLifecycleStatus(ctx, job.ProjectID, successStatus)
		cancel()
		if err := msg.Ack(false); err != nil {
			log.Printf("Failed to ack service control job: %v", err)
		}
	}
}

func (w *Worker) handleCleanupJobs(msgs <-chan amqp.Delivery) {
	for msg := range msgs {
		var job CleanupJobEvent
		if err := json.Unmarshal(msg.Body, &job); err != nil {
			log.Printf("Dropping malformed cleanup job: %v", err)
			if err := msg.Nack(false, false); err != nil {
				log.Printf("Failed to nack malformed cleanup job: %v", err)
			}
			continue
		}
		if err := validateCleanupJob(job); err != nil {
			log.Printf("Dropping invalid cleanup job for project %q: %v", job.ProjectID, err)
			if job.ProjectID != "" {
				w.markProjectDeleteFailed(context.Background(), job.ProjectID, err)
			}
			if err := msg.Ack(false); err != nil {
				log.Printf("Failed to ack invalid cleanup job: %v", err)
			}
			continue
		}

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
		if err := w.deployer.Teardown(ctx, job.Slug); err != nil {
			log.Printf("Failed to teardown %s: %v", job.Slug, err)
			w.markProjectDeleteFailed(ctx, job.ProjectID, err)
			cancel()
			if err := msg.Ack(false); err != nil {
				log.Printf("Failed to ack failed cleanup job: %v", err)
			}
			continue
		}
		if err := w.deleteProjectImages(ctx, job.ProjectID); err != nil {
			log.Printf("Failed to delete ECR images for project %s: %v", job.ProjectID, err)
			w.markProjectDeleteFailed(ctx, job.ProjectID, err)
			cancel()
			if err := msg.Ack(false); err != nil {
				log.Printf("Failed to ack failed cleanup job: %v", err)
			}
			continue
		}
		w.deleteProjectRecord(ctx, job.ProjectID)
		cancel()
		if err := msg.Ack(false); err != nil {
			log.Printf("Failed to ack cleanup job: %v", err)
		}
	}
}

func (w *Worker) processJob(job DeployJobEvent) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	if w.isCanceled(ctx, job.DeploymentID) {
		w.streamer.Publish(ctx, job.DeploymentID, "Deployment canceled before provisioning")
		return
	}

	w.updateDeploymentStatus(ctx, job.DeploymentID, "deploying")

	envMap, err := w.fetchEnvVars(ctx, job.DeploymentID)
	if err != nil {
		w.streamer.Publish(ctx, job.DeploymentID, fmt.Sprintf("Environment load failed: %v", err))
		w.markDeploymentFailed(ctx, job.DeploymentID, "env", err)
		return
	}

	result, err := w.deployer.Deploy(ctx, ecsdeploy.DeployInput{
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
		if errors.Is(err, ecsdeploy.ErrCanceled) {
			w.streamer.Publish(ctx, job.DeploymentID, "Deployment canceled")
			w.cleanupCanceledDeployment(ctx, job)
			w.updateDeploymentStatus(ctx, job.DeploymentID, "canceled")
			return
		}
		w.streamer.Publish(ctx, job.DeploymentID, fmt.Sprintf("Deployment failed: %v", err))
		w.markDeploymentFailed(ctx, job.DeploymentID, "deploy", err)
		return
	}

	if w.isCanceled(ctx, job.DeploymentID) {
		w.streamer.Publish(ctx, job.DeploymentID, "Deployment canceled before finalization")
		w.cleanupCanceledDeployment(ctx, job)
		w.updateDeploymentStatus(ctx, job.DeploymentID, "canceled")
		return
	}

	w.finalizeDeployment(ctx, job.DeploymentID, job.ImageURI, result)
}

func (w *Worker) cleanupCanceledDeployment(ctx context.Context, job DeployJobEvent) {
	if err := w.deleteImageURI(ctx, job.ImageURI); err != nil {
		log.Printf("Failed to delete canceled deployment image %s: %v", job.ImageURI, err)
		w.streamer.Publish(ctx, job.DeploymentID, fmt.Sprintf("Warning: failed to delete canceled image: %v", err))
	}

	if w.hasExistingLiveDeployment(ctx, job.DeploymentID) {
		w.streamer.Publish(ctx, job.DeploymentID, "Skipping cloud teardown because an existing live deployment owns this service")
		return
	}

	if strings.TrimSpace(job.Subdomain) == "" {
		return
	}
	if err := w.deployer.Teardown(ctx, job.Subdomain); err != nil {
		log.Printf("Failed to cleanup canceled deployment %s: %v", job.DeploymentID, err)
		w.streamer.Publish(ctx, job.DeploymentID, fmt.Sprintf("Warning: failed to clean up canceled resources: %v", err))
		return
	}
	w.streamer.Publish(ctx, job.DeploymentID, "Canceled deployment resources cleaned up")
}

func validateDeployJob(job DeployJobEvent) error {
	if strings.TrimSpace(job.DeploymentID) == "" {
		return fmt.Errorf("deployment_id is required")
	}
	if strings.TrimSpace(job.ImageURI) == "" {
		return fmt.Errorf("image_uri is required")
	}
	if strings.TrimSpace(job.Subdomain) == "" {
		return fmt.Errorf("subdomain is required")
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
	if len(job.HealthCheck) > 1024 {
		return fmt.Errorf("health_check is too long")
	}
	if strings.Contains(job.HealthCheck, "\x00") {
		return fmt.Errorf("health_check contains invalid characters")
	}
	return nil
}

func validateCleanupJob(job CleanupJobEvent) error {
	if strings.TrimSpace(job.ProjectID) == "" {
		return fmt.Errorf("project_id is required")
	}
	if strings.TrimSpace(job.Slug) == "" {
		return fmt.Errorf("slug is required")
	}
	return nil
}

func validateServiceControlJob(job ServiceControlJobEvent) error {
	if strings.TrimSpace(job.ProjectID) == "" {
		return fmt.Errorf("project_id is required")
	}
	if strings.TrimSpace(job.Slug) == "" {
		return fmt.Errorf("slug is required")
	}
	if job.Action != "suspend" && job.Action != "resume" {
		return fmt.Errorf("unsupported action: %s", job.Action)
	}
	return nil
}

func (w *Worker) hasExistingLiveDeployment(ctx context.Context, deploymentID string) bool {
	ctx, cancel := boundedContext(ctx, 5*time.Second)
	defer cancel()

	var exists bool
	err := w.db.QueryRowContext(
		ctx,
		`
			SELECT EXISTS (
				SELECT 1
				FROM deployments current_deployment
				JOIN deployments live_deployment
				  ON live_deployment.project_id = current_deployment.project_id
				WHERE current_deployment.id = $1
				  AND live_deployment.id <> current_deployment.id
				  AND live_deployment.status = 'live'
			)`,
		deploymentID,
	).Scan(&exists)
	if err != nil {
		log.Printf("Failed to check existing live deployment for %s: %v", deploymentID, err)
		return true
	}
	return exists
}

func (w *Worker) isCanceled(ctx context.Context, deploymentID string) bool {
	canceled, err := w.isDeploymentCanceled(ctx, deploymentID)
	return err == nil && canceled
}

func (w *Worker) isDeploymentCanceled(ctx context.Context, deploymentID string) (bool, error) {
	ctx, cancel := boundedContext(ctx, 2*time.Second)
	defer cancel()

	var status string
	err := w.db.QueryRowContext(ctx, "SELECT status FROM deployments WHERE id = $1", deploymentID).Scan(&status)
	if err != nil {
		return false, err
	}
	return status == "canceled", nil
}

func (w *Worker) fetchEnvVars(ctx context.Context, deploymentID string) (map[string]string, error) {
	ctx, cancel := boundedContext(ctx, 5*time.Second)
	defer cancel()

	envMap := make(map[string]string)

	rows, err := w.db.QueryContext(ctx, "SELECT key, value FROM env_vars WHERE deployment_id = $1", deploymentID)
	if err != nil {
		return envMap, err
	}
	defer rows.Close()

	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err == nil {
			value, err := w.secrets.Decrypt(v)
			if err != nil {
				return nil, fmt.Errorf("failed to decrypt env var %s: %w", k, err)
			}
			envMap[k] = value
		} else {
			return nil, err
		}
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return envMap, nil
}

func (w *Worker) updateDeploymentStatus(ctx context.Context, id, status string) {
	ctx, cancel := boundedContext(ctx, 5*time.Second)
	defer cancel()

	_, err := w.db.ExecContext(
		ctx,
		`
			UPDATE deployments
			SET status = $1,
			    error_stage = NULL,
			    error_message = NULL,
			    failed_at = NULL
			WHERE id = $2 AND ($1 = 'canceled' OR status <> 'canceled')`,
		status,
		id,
	)
	if err != nil {
		log.Printf("Failed to update deployment status for %s: %v", id, err)
	}
}

func (w *Worker) markDeploymentFailed(ctx context.Context, id, stage string, cause error) {
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
		id,
		stage,
		cause.Error(),
	)
	if err != nil {
		log.Printf("Failed to mark deployment failed for %s: %v", id, err)
	}
}

func (w *Worker) markProjectDeleteFailed(ctx context.Context, projectID string, cause error) {
	w.markProjectOperationFailed(ctx, projectID, "delete_failed", cause)
}

func (w *Worker) markProjectOperationFailed(ctx context.Context, projectID, status string, cause error) {
	ctx, cancel := boundedContext(ctx, 5*time.Second)
	defer cancel()

	_, err := w.db.ExecContext(
		ctx,
		"UPDATE projects SET status = $2, delete_error = $3 WHERE id = $1",
		projectID,
		status,
		cause.Error(),
	)
	if err != nil {
		log.Printf("Failed to mark project operation failed for %s: %v", projectID, err)
	}
}

func (w *Worker) updateProjectLifecycleStatus(ctx context.Context, projectID, status string) {
	ctx, cancel := boundedContext(ctx, 5*time.Second)
	defer cancel()

	_, err := w.db.ExecContext(
		ctx,
		"UPDATE projects SET status = $2, delete_error = NULL WHERE id = $1",
		projectID,
		status,
	)
	if err != nil {
		log.Printf("Failed to update project lifecycle status for %s: %v", projectID, err)
	}
}

func (w *Worker) deleteProjectRecord(ctx context.Context, projectID string) {
	ctx, cancel := boundedContext(ctx, 5*time.Second)
	defer cancel()

	_, err := w.db.ExecContext(ctx, "DELETE FROM projects WHERE id = $1", projectID)
	if err != nil {
		log.Printf("Failed to delete project record %s after cleanup: %v", projectID, err)
	}
}

func (w *Worker) deleteProjectImages(ctx context.Context, projectID string) error {
	ctx, cancel := boundedContext(ctx, 30*time.Second)
	defer cancel()

	rows, err := w.db.QueryContext(
		ctx,
		`SELECT DISTINCT image_uri FROM deployments WHERE project_id = $1 AND image_uri IS NOT NULL AND image_uri <> ''`,
		projectID,
	)
	if err != nil {
		return fmt.Errorf("failed to list project images: %w", err)
	}
	defer rows.Close()

	imagesByRepository := map[string][]ecrtypes.ImageIdentifier{}
	for rows.Next() {
		var imageURI string
		if err := rows.Scan(&imageURI); err != nil {
			return fmt.Errorf("failed to scan project image: %w", err)
		}
		ref, ok := parseECRImageURI(imageURI)
		if !ok {
			continue
		}
		imagesByRepository[ref.repository] = append(imagesByRepository[ref.repository], ecrtypes.ImageIdentifier{
			ImageTag: aws.String(ref.tag),
		})
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for repository, images := range imagesByRepository {
		if len(images) == 0 {
			continue
		}
		out, err := w.ecr.BatchDeleteImage(ctx, &ecr.BatchDeleteImageInput{
			RepositoryName: aws.String(repository),
			ImageIds:       images,
		})
		if err != nil {
			return fmt.Errorf("failed to delete ECR images from %s: %w", repository, err)
		}
		if err := checkECRDeleteFailures(repository, out.Failures); err != nil {
			return err
		}
	}

	return nil
}

func (w *Worker) deleteImageURI(ctx context.Context, imageURI string) error {
	ctx, cancel := boundedContext(ctx, 30*time.Second)
	defer cancel()

	ref, ok := parseECRImageURI(imageURI)
	if !ok {
		return nil
	}
	out, err := w.ecr.BatchDeleteImage(ctx, &ecr.BatchDeleteImageInput{
		RepositoryName: aws.String(ref.repository),
		ImageIds: []ecrtypes.ImageIdentifier{
			{ImageTag: aws.String(ref.tag)},
		},
	})
	if err != nil {
		return fmt.Errorf("failed to delete ECR image %s: %w", imageURI, err)
	}
	if err := checkECRDeleteFailures(ref.repository, out.Failures); err != nil {
		return fmt.Errorf("failed to delete ECR image %s: %w", imageURI, err)
	}
	return nil
}

func checkECRDeleteFailures(repository string, failures []ecrtypes.ImageFailure) error {
	for _, failure := range failures {
		code := string(failure.FailureCode)
		if code == "" {
			continue
		}
		if strings.EqualFold(code, "ImageNotFound") {
			continue
		}
		reason := ""
		if failure.FailureReason != nil {
			reason = *failure.FailureReason
		}
		return fmt.Errorf("failed to delete ECR image from %s: %s %s", repository, code, strings.TrimSpace(reason))
	}
	return nil
}

func parseECRImageURI(imageURI string) (struct {
	repository string
	tag        string
}, bool) {
	var ref struct {
		repository string
		tag        string
	}
	parts := strings.SplitN(strings.TrimSpace(imageURI), "/", 2)
	if len(parts) != 2 || parts[1] == "" {
		return ref, false
	}
	repositoryAndTag := parts[1]
	tagIndex := strings.LastIndex(repositoryAndTag, ":")
	if tagIndex <= 0 || tagIndex == len(repositoryAndTag)-1 {
		return ref, false
	}
	ref.repository = repositoryAndTag[:tagIndex]
	ref.tag = repositoryAndTag[tagIndex+1:]
	return ref, true
}

func (w *Worker) finalizeDeployment(ctx context.Context, id, image string, result ecsdeploy.DeployResult) {
	ctx, cancel := boundedContext(ctx, 5*time.Second)
	defer cancel()

	query := `
		UPDATE deployments 
		SET status = 'live',
		    image_uri = $2,
		    url = $3,
		    ecs_task_arn = $4,
		    ecs_service_name = $5,
		    target_group_arn = $6,
		    error_stage = NULL,
		    error_message = NULL,
		    failed_at = NULL,
		    deployed_at = now()
		WHERE id = $1 AND status <> 'canceled'`

	resultExec, err := w.db.ExecContext(
		ctx,
		query,
		id,
		image,
		result.PublicURL,
		result.TaskDefinitionARN,
		result.ServiceName,
		result.TargetGroupARN,
	)
	if err != nil {
		log.Printf("Failed to finalize deployment %s: %v", id, err)
		w.streamer.Publish(ctx, id, fmt.Sprintf("Warning: Deployment live but status update failed: %v", err))
		return
	}
	if rows, err := resultExec.RowsAffected(); err == nil && rows == 0 {
		w.streamer.Publish(ctx, id, "Deployment finished after cancellation; skipping live status update")
	}
}

func boundedContext(parent context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	if _, ok := parent.Deadline(); ok {
		return context.WithCancel(parent)
	}
	return context.WithTimeout(parent, timeout)
}

func (w *Worker) connection() *amqp.Connection {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.conn
}

func (w *Worker) closeRabbit() {
	w.mu.Lock()
	consumers := append([]queueConsumer(nil), w.consumers...)
	conn := w.conn
	w.consumers = nil
	w.conn = nil
	w.mu.Unlock()

	for _, consumer := range consumers {
		if consumer.ch != nil {
			_ = consumer.ch.Close()
		}
	}
	if conn != nil {
		_ = conn.Close()
	}
}

func (w *Worker) Close() {
	if w.db != nil {
		w.db.Close()
	}
	w.closeRabbit()
}
