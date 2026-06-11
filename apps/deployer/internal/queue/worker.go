package queue

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"

	ecsdeploy "github.com/YHQZ1/hatch/apps/deployer/internal/ecs"
	"github.com/YHQZ1/hatch/apps/deployer/internal/logs"
	"github.com/YHQZ1/hatch/packages/secrets"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ecr"
	ecrtypes "github.com/aws/aws-sdk-go-v2/service/ecr/types"
	_ "github.com/lib/pq"
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
	ECRRegistry          string
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
	cfg      Config
	streamer *logs.Streamer
	deployer *ecsdeploy.Deployer
	db       *sql.DB
	conn     *amqp.Connection
	ch       *amqp.Channel
	secrets  *secrets.Codec
	ecr      *ecr.Client
}

func NewWorker(cfg Config) *Worker {
	secretCodec, err := secrets.NewCodec(cfg.DataEncryptionKey)
	if err != nil {
		log.Fatalf("Failed to initialize secret codec: %v", err)
	}

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	if err := db.Ping(); err != nil {
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
	}
	deployer.SetCancelChecker(worker.isDeploymentCanceled)

	return worker
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

	_, err = w.ch.QueueDeclare("hatch.service.jobs", true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("failed to declare service queue: %w", err)
	}

	deployMsgs, err := w.ch.Consume("hatch.deploy.jobs", "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("failed to consume deploy queue: %w", err)
	}

	cleanupMsgs, err := w.ch.Consume("hatch.cleanup.jobs", "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("failed to consume cleanup queue: %w", err)
	}

	serviceMsgs, err := w.ch.Consume("hatch.service.jobs", "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("failed to consume service queue: %w", err)
	}

	go w.handleCleanupJobs(cleanupMsgs)
	go w.handleServiceControlJobs(serviceMsgs)

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

func (w *Worker) handleServiceControlJobs(msgs <-chan amqp.Delivery) {
	for msg := range msgs {
		var job ServiceControlJobEvent
		if err := json.Unmarshal(msg.Body, &job); err != nil || job.ProjectID == "" || job.Slug == "" {
			msg.Nack(false, false)
			continue
		}

		ctx := context.Background()
		var desiredCount int32
		successStatus := "active"
		failedStatus := "resume_failed"
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
			msg.Nack(false, false)
			continue
		}

		if err := w.deployer.SetServiceDesiredCount(ctx, job.Slug, desiredCount); err != nil {
			log.Printf("Failed to %s %s: %v", job.Action, job.Slug, err)
			w.markProjectOperationFailed(ctx, job.ProjectID, failedStatus, err)
			msg.Ack(false)
			continue
		}

		w.updateProjectLifecycleStatus(ctx, job.ProjectID, successStatus)
		msg.Ack(false)
	}
}

func (w *Worker) handleCleanupJobs(msgs <-chan amqp.Delivery) {
	for msg := range msgs {
		var job CleanupJobEvent
		if err := json.Unmarshal(msg.Body, &job); err != nil || job.ProjectID == "" || job.Slug == "" {
			msg.Nack(false, false)
			continue
		}

		ctx := context.Background()
		if err := w.deployer.Teardown(ctx, job.Slug); err != nil {
			log.Printf("Failed to teardown %s: %v", job.Slug, err)
			w.markProjectDeleteFailed(ctx, job.ProjectID, err)
			msg.Ack(false)
			continue
		}
		if err := w.deleteProjectImages(ctx, job.ProjectID); err != nil {
			log.Printf("Failed to delete ECR images for project %s: %v", job.ProjectID, err)
			w.markProjectDeleteFailed(ctx, job.ProjectID, err)
			msg.Ack(false)
			continue
		}
		w.deleteProjectRecord(ctx, job.ProjectID)
		msg.Ack(false)
	}
}

func (w *Worker) processJob(job DeployJobEvent) {
	ctx := context.Background()
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
			w.updateDeploymentStatus(ctx, job.DeploymentID, "canceled")
			return
		}
		w.streamer.Publish(ctx, job.DeploymentID, fmt.Sprintf("Deployment failed: %v", err))
		w.markDeploymentFailed(ctx, job.DeploymentID, "deploy", err)
		return
	}

	if w.isCanceled(ctx, job.DeploymentID) {
		w.streamer.Publish(ctx, job.DeploymentID, "Deployment canceled before finalization")
		w.updateDeploymentStatus(ctx, job.DeploymentID, "canceled")
		return
	}

	w.finalizeDeployment(ctx, job.DeploymentID, job.ImageURI, result)
}

func (w *Worker) isCanceled(ctx context.Context, deploymentID string) bool {
	canceled, err := w.isDeploymentCanceled(ctx, deploymentID)
	return err == nil && canceled
}

func (w *Worker) isDeploymentCanceled(ctx context.Context, deploymentID string) (bool, error) {
	var status string
	err := w.db.QueryRowContext(ctx, "SELECT status FROM deployments WHERE id = $1", deploymentID).Scan(&status)
	if err != nil {
		return false, err
	}
	return status == "canceled", nil
}

func (w *Worker) fetchEnvVars(ctx context.Context, deploymentID string) (map[string]string, error) {
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
	_, err := w.db.ExecContext(
		ctx,
		`
			UPDATE deployments
			SET status = $1,
			    error_stage = NULL,
			    error_message = NULL,
			    failed_at = NULL
			WHERE id = $2`,
		status,
		id,
	)
	if err != nil {
		log.Printf("Failed to update deployment status for %s: %v", id, err)
	}
}

func (w *Worker) markDeploymentFailed(ctx context.Context, id, stage string, cause error) {
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
	_, err := w.db.ExecContext(ctx, "DELETE FROM projects WHERE id = $1", projectID)
	if err != nil {
		log.Printf("Failed to delete project record %s after cleanup: %v", projectID, err)
	}
}

func (w *Worker) deleteProjectImages(ctx context.Context, projectID string) error {
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
		_, err := w.ecr.BatchDeleteImage(ctx, &ecr.BatchDeleteImageInput{
			RepositoryName: aws.String(repository),
			ImageIds:       images,
		})
		if err != nil {
			return fmt.Errorf("failed to delete ECR images from %s: %w", repository, err)
		}
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
		WHERE id = $1`

	_, err := w.db.ExecContext(
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
