package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/YHQZ1/hatch/internal/api/queue"
	"github.com/YHQZ1/hatch/internal/secrets"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type WebhookHandler struct {
	queries   *dbpkg.Queries
	db        *sql.DB
	publisher *queue.Publisher
	secrets   *secrets.Codec
}

func NewWebhookHandler(db *sql.DB, publisher *queue.Publisher, secretCodec *secrets.Codec) *WebhookHandler {
	return &WebhookHandler{
		queries:   dbpkg.New(db),
		db:        db,
		publisher: publisher,
		secrets:   secretCodec,
	}
}

func (h *WebhookHandler) buildDeploymentEnvSnapshot(ctx context.Context, q *dbpkg.Queries, projectID uuid.UUID, overrides map[string]string) (map[string]string, error) {
	projectEnvVars, err := q.GetProjectEnvVarsByProject(ctx, projectID)
	if err != nil {
		return nil, err
	}

	envSnapshot := make(map[string]string)
	for _, envVar := range projectEnvVars {
		value, err := h.secrets.Decrypt(envVar.Value)
		if err != nil {
			return nil, err
		}
		envSnapshot[envVar.Key] = value
	}
	normalizedOverrides, err := normalizeEnvVars(overrides)
	if err != nil {
		return nil, err
	}
	for key, value := range normalizedOverrides {
		envSnapshot[key] = value
	}
	return envSnapshot, nil
}

type githubPushEvent struct {
	Ref        string `json:"ref"`
	Deleted    bool   `json:"deleted"`
	Repository struct {
		HTMLURL string `json:"html_url"`
	} `json:"repository"`
	HeadCommit struct {
		ID      string `json:"id"`
		Message string `json:"message"`
	} `json:"head_commit"`
}

const maxWebhookBodyBytes = 1 << 20

func (h *WebhookHandler) HandlePush(c *gin.Context) {
	if c.GetHeader("X-GitHub-Event") != "push" {
		c.Status(http.StatusNoContent)
		return
	}

	signature := strings.TrimSpace(c.GetHeader("X-Hub-Signature-256"))
	deliveryID := strings.TrimSpace(c.GetHeader("X-GitHub-Delivery"))
	if signature == "" || deliveryID == "" || len(deliveryID) > 128 {
		c.Status(http.StatusUnauthorized)
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxWebhookBodyBytes)
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			c.Status(http.StatusRequestEntityTooLarge)
			return
		}
		c.Status(http.StatusBadRequest)
		return
	}

	var payload githubPushEvent
	if err := json.Unmarshal(body, &payload); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	if payload.Deleted {
		c.Status(http.StatusNoContent)
		return
	}

	repoURL, err := normalizeGitHubRepoURL(payload.Repository.HTMLURL)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	projects, err := h.queries.GetProjectsByRepoURL(c.Request.Context(), repoURL)
	if err != nil {
		c.Status(http.StatusAccepted)
		return
	}

	project, ok := h.matchWebhookProject(c.Request.Context(), projects, body, signature)
	if !ok {
		slog.WarnContext(c.Request.Context(), "no webhook signature matched", "alert", "security", "repo_url", repoURL)
		c.Status(http.StatusUnauthorized)
		return
	}

	if !project.AutoDeploy {
		c.Status(http.StatusNoContent)
		return
	}
	if project.Status != "" && project.Status != "active" {
		c.Status(http.StatusNoContent)
		return
	}

	targetRef := fmt.Sprintf("refs/heads/%s", project.Branch)
	if payload.Ref != targetRef {
		c.Status(http.StatusNoContent)
		return
	}

	resourceName := project.ID.String()[:8]
	if project.Subdomain.Valid && project.Subdomain.String != "" {
		resourceName = project.Subdomain.String
	}
	healthCheck := h.latestHealthCheck(c.Request.Context(), project.ID)

	tx, err := h.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	_, _ = tx.ExecContext(
		c.Request.Context(),
		"DELETE FROM webhook_deliveries WHERE project_id = $1 AND created_at < now() - interval '30 days'",
		project.ID,
	)
	var storedDeliveryID string
	err = tx.QueryRowContext(
		c.Request.Context(),
		`
			INSERT INTO webhook_deliveries (project_id, delivery_id)
			VALUES ($1, $2)
			ON CONFLICT DO NOTHING
			RETURNING delivery_id`,
		project.ID,
		deliveryID,
	).Scan(&storedDeliveryID)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusAccepted, gin.H{"status": "delivery already processed"})
		return
	}
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	qtx := h.queries.WithTx(tx)
	deployment, err := qtx.CreateDeployment(c.Request.Context(), dbpkg.CreateDeploymentParams{
		ProjectID:     project.ID,
		Branch:        project.Branch,
		Cpu:           defaultDeploymentCPU,
		MemoryMb:      defaultDeploymentMemoryMB,
		Port:          project.Port,
		HealthCheck:   healthCheck,
		Subdomain:     sql.NullString{String: resourceName, Valid: true},
		CommitSha:     nullString(payload.HeadCommit.ID),
		CommitMessage: nullString(firstCommitLine(payload.HeadCommit.Message)),
	})
	if err != nil {
		if isActiveDeploymentConflict(err) {
			c.JSON(http.StatusAccepted, gin.H{"status": "deployment already running"})
			return
		}
		c.Status(http.StatusInternalServerError)
		return
	}

	envSnapshot, err := h.buildDeploymentEnvSnapshot(c.Request.Context(), qtx, project.ID, nil)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	for key, value := range envSnapshot {
		storedValue, err := h.secrets.Encrypt(value)
		if err != nil {
			c.Status(http.StatusInternalServerError)
			return
		}
		if _, err := qtx.CreateEnvVar(c.Request.Context(), dbpkg.CreateEnvVarParams{
			DeploymentID: deployment.ID,
			Key:          key,
			Value:        storedValue,
			SecretArn:    sql.NullString{},
		}); err != nil {
			c.Status(http.StatusInternalServerError)
			return
		}
	}
	if err := tx.Commit(); err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	if err := h.publisher.PublishBuildJob(c.Request.Context(), queue.BuildJobEvent{
		DeploymentID:   deployment.ID.String(),
		RepoURL:        project.RepoUrl,
		Branch:         project.Branch,
		DockerfilePath: project.DockerfilePath,
		UserID:         project.UserID.String(),
		Port:           int(project.Port),
		Subdomain:      resourceName,
		CPU:            defaultDeploymentCPU,
		MemoryMB:       defaultDeploymentMemoryMB,
		HealthCheck:    healthCheck,
	}); err != nil {
		_, _ = h.queries.MarkDeploymentFailed(c.Request.Context(), dbpkg.MarkDeploymentFailedParams{
			ID:           deployment.ID,
			ErrorStage:   sql.NullString{String: "queue", Valid: true},
			ErrorMessage: sql.NullString{String: "failed to queue webhook deployment", Valid: true},
		})
		c.Status(http.StatusServiceUnavailable)
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"status": "deploying",
		"id":     deployment.ID,
	})
}

func (h *WebhookHandler) latestHealthCheck(ctx context.Context, projectID uuid.UUID) string {
	var healthCheck string
	err := h.db.QueryRowContext(
		ctx,
		`
			SELECT health_check
			FROM deployments
			WHERE project_id = $1
			ORDER BY created_at DESC
			LIMIT 1`,
		projectID,
	).Scan(&healthCheck)
	if err != nil || strings.TrimSpace(healthCheck) == "" {
		return "/"
	}
	return healthCheck
}

func (h *WebhookHandler) matchWebhookProject(ctx context.Context, projects []dbpkg.Project, body []byte, signature string) (dbpkg.Project, bool) {
	for _, project := range projects {
		if project.WebhookSecret.Valid && project.WebhookSecret.String != "" {
			secret, err := h.secrets.Decrypt(project.WebhookSecret.String)
			if err != nil {
				slog.ErrorContext(ctx, "failed to decrypt a webhook secret", "alert", "security", "project_id", project.ID, "error", err)
				continue
			}
			if verifySignature(body, secret, signature) {
				return project, true
			}
			continue
		}
	}

	return dbpkg.Project{}, false
}

func verifySignature(body []byte, secret, signature string) bool {
	// If secret is missing but verification was called, fail safe.
	if secret == "" || signature == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}
