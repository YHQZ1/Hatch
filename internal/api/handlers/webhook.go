package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/YHQZ1/hatch/internal/jobs"
	"github.com/YHQZ1/hatch/internal/secrets"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WebhookHandler receives the GitHub App's webhook (ADR 0010). GitHub sends one
// delivery per event for every repository the App is installed on, signed with
// the secret set on the App; there is no hook, and no secret, per project.
type WebhookHandler struct {
	queries *dbpkg.Queries
	pool    *pgxpool.Pool
	jobs    jobs.Inserter
	secrets *secrets.Codec
	// secret is the App's webhook secret. Without one nothing can be verified,
	// so every delivery is refused.
	secret string
}

func NewWebhookHandler(pool *pgxpool.Pool, inserter jobs.Inserter, secretCodec *secrets.Codec, appSecret string) *WebhookHandler {
	return &WebhookHandler{
		queries: dbpkg.New(pool),
		pool:    pool,
		jobs:    inserter,
		secrets: secretCodec,
		secret:  appSecret,
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

// maxWebhookBodyBytes bounds a delivery. A push lists at most a few commits, so
// real ones are far smaller.
const maxWebhookBodyBytes = 5 << 20

// HandleGitHub is POST /api/webhooks/github, the URL the GitHub App's webhook
// points at. It checks the signature before anything else, so an unsigned
// request learns nothing, then answers a ping, queues a deployment for every
// project that follows the pushed branch, and ignores other events.
func (h *WebhookHandler) HandleGitHub(c *gin.Context) {
	ctx := c.Request.Context()
	if h.secret == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "webhooks are not set up on this Hatch server"})
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

	if !verifySignature(body, h.secret, strings.TrimSpace(c.GetHeader("X-Hub-Signature-256"))) {
		slog.WarnContext(ctx, "a webhook delivery was refused: bad or missing signature", "alert", "security")
		c.Status(http.StatusUnauthorized)
		return
	}

	switch c.GetHeader("X-GitHub-Event") {
	case "ping":
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	case "push":
		h.handlePush(c, body)
	default:
		c.Status(http.StatusNoContent)
	}
}

func (h *WebhookHandler) handlePush(c *gin.Context, body []byte) {
	ctx := c.Request.Context()
	deliveryID := strings.TrimSpace(c.GetHeader("X-GitHub-Delivery"))
	if deliveryID == "" || len(deliveryID) > 128 {
		c.Status(http.StatusBadRequest)
		return
	}

	var payload githubPushEvent
	if err := json.Unmarshal(body, &payload); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	// Deleting a branch, and tags, deploy nothing.
	if payload.Deleted || !strings.HasPrefix(payload.Ref, "refs/heads/") {
		c.Status(http.StatusNoContent)
		return
	}
	repoURL, err := normalizeGitHubRepoURL(payload.Repository.HTMLURL)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	projects, err := h.queries.GetProjectsByRepoURL(ctx, repoURL)
	if err != nil {
		slog.ErrorContext(ctx, "could not look up the projects of a pushed repository", "repo_url", repoURL, "error", err)
		c.Status(http.StatusInternalServerError)
		return
	}

	// One push can deploy several projects built from the same repository. Each
	// gets its own transaction, so one that fails does not stop the others.
	var deployed []string
	failed := 0
	for _, project := range projects {
		if !project.AutoDeploy || (project.Status != "" && project.Status != "active") {
			continue
		}
		if payload.Ref != "refs/heads/"+project.Branch {
			continue
		}
		id, err := h.queuePushDeployment(ctx, project, payload, deliveryID)
		switch {
		case err != nil:
			failed++
			slog.ErrorContext(ctx, "could not queue the deployment of a push", "project_id", project.ID, "error", err)
		case id != uuid.Nil:
			deployed = append(deployed, id.String())
		}
	}

	if failed > 0 && len(deployed) == 0 {
		c.Status(http.StatusInternalServerError)
		return
	}
	if len(deployed) == 0 {
		c.Status(http.StatusNoContent)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"status": "deploying", "deployments": deployed})
}

// queuePushDeployment starts a deployment of the project for a push, unless this
// delivery was already handled for it or the project is already deploying. It
// returns the new deployment's id, or uuid.Nil when it deliberately did nothing.
func (h *WebhookHandler) queuePushDeployment(ctx context.Context, project dbpkg.Project, payload githubPushEvent, deliveryID string) (uuid.UUID, error) {
	resourceName := project.ID.String()[:8]
	if project.Subdomain != nil && *project.Subdomain != "" {
		resourceName = *project.Subdomain
	}
	healthCheck, err := effectiveHealthCheck("", project.HealthCheck)
	if err != nil {
		healthCheck = "/"
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Deliveries are remembered for 30 days, so GitHub redelivering one (or a retry
	// by hand) does not deploy twice.
	_, _ = tx.Exec(ctx, "DELETE FROM webhook_deliveries WHERE project_id = $1 AND created_at < now() - interval '30 days'", project.ID)
	var stored string
	err = tx.QueryRow(ctx, `
		INSERT INTO webhook_deliveries (project_id, delivery_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
		RETURNING delivery_id`, project.ID, deliveryID).Scan(&stored)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, nil
	}
	if err != nil {
		return uuid.Nil, err
	}

	qtx := h.queries.WithTx(tx)
	deployment, err := qtx.CreateDeployment(ctx, dbpkg.CreateDeploymentParams{
		ProjectID:     project.ID,
		Branch:        project.Branch,
		Cpu:           defaultDeploymentCPU,
		MemoryMb:      defaultDeploymentMemoryMB,
		Port:          project.Port,
		HealthCheck:   healthCheck,
		Subdomain:     ptr(resourceName),
		CommitSha:     nullString(payload.HeadCommit.ID),
		CommitMessage: nullString(firstCommitLine(payload.HeadCommit.Message)),
	})
	if err != nil {
		if isActiveDeploymentConflict(err) {
			return uuid.Nil, nil // already building; this push is not lost, the next deploy has it
		}
		return uuid.Nil, err
	}

	envSnapshot, err := h.buildDeploymentEnvSnapshot(ctx, qtx, project.ID, nil)
	if err != nil {
		return uuid.Nil, err
	}
	for key, value := range envSnapshot {
		storedValue, err := h.secrets.Encrypt(value)
		if err != nil {
			return uuid.Nil, err
		}
		if _, err := qtx.CreateEnvVar(ctx, dbpkg.CreateEnvVarParams{DeploymentID: deployment.ID, Key: key, Value: storedValue}); err != nil {
			return uuid.Nil, err
		}
	}
	if _, err := h.jobs.InsertTx(ctx, tx, jobs.BuildArgs{
		DeploymentID:   deployment.ID,
		RepoURL:        project.RepoUrl,
		Branch:         project.Branch,
		DockerfilePath: project.DockerfilePath,
		Port:           project.Port,
		Subdomain:      resourceName,
		CPU:            defaultDeploymentCPU,
		MemoryMB:       defaultDeploymentMemoryMB,
		HealthCheck:    healthCheck,
	}, nil); err != nil {
		return uuid.Nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}
	return deployment.ID, nil
}

// verifySignature checks the X-Hub-Signature-256 header GitHub sends: the
// HMAC-SHA256 of the body under the webhook secret, compared in constant time.
func verifySignature(body []byte, secret, signature string) bool {
	if secret == "" || signature == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}
