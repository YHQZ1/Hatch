package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/YHQZ1/hatch/apps/api/internal/queue"
	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
	"github.com/gin-gonic/gin"
)

type WebhookHandler struct {
	queries   *dbpkg.Queries
	db        *sql.DB
	publisher *queue.Publisher
}

func NewWebhookHandler(db *sql.DB, publisher *queue.Publisher) *WebhookHandler {
	return &WebhookHandler{
		queries:   dbpkg.New(db),
		db:        db,
		publisher: publisher,
	}
}

type githubPushEvent struct {
	Ref        string `json:"ref"`
	Repository struct {
		HTMLURL string `json:"html_url"`
	} `json:"repository"`
	HeadCommit struct {
		ID      string `json:"id"`
		Message string `json:"message"`
	} `json:"head_commit"`
}

func (h *WebhookHandler) HandlePush(c *gin.Context) {
	// 1. Quick check for event type
	if c.GetHeader("X-GitHub-Event") != "push" {
		c.Status(http.StatusNoContent)
		return
	}

	// 2. Read body once
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	var payload githubPushEvent
	if err := json.Unmarshal(body, &payload); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	// 3. NORMALIZATION: GitHub sends URLs with or without .git
	// We trim it to match whatever is stored in your DB
	repoURL := strings.TrimSuffix(payload.Repository.HTMLURL, ".git")

	// 4. Look up projects. Multiple Hatch services may point at the same repo,
	// so use the webhook signature to select the exact project/secret.
	projects, err := h.queries.GetProjectsByRepoURL(c.Request.Context(), repoURL)
	if err != nil {
		// If project doesn't exist, we return 202 to avoid GitHub retries
		c.Status(http.StatusAccepted)
		return
	}

	signature := c.GetHeader("X-Hub-Signature-256")
	project, ok := matchWebhookProject(projects, body, signature)
	if !ok {
		log.Printf("[SECURITY] No matching webhook signature for repo: %s", repoURL)
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

	// 6. Branch Check
	targetRef := fmt.Sprintf("refs/heads/%s", project.Branch)
	if payload.Ref != targetRef {
		c.Status(http.StatusNoContent)
		return
	}

	// 7. Get User Token
	user, err := h.queries.GetUserByID(c.Request.Context(), project.UserID)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	// 8. Resource Naming (Subdomain)
	resourceName := project.ID.String()[:8]
	if project.Subdomain.Valid && project.Subdomain.String != "" {
		resourceName = project.Subdomain.String
	}

	// 9. Database Entry
	tx, err := h.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	qtx := h.queries.WithTx(tx)
	deployment, err := qtx.CreateDeployment(c.Request.Context(), dbpkg.CreateDeploymentParams{
		ProjectID:     project.ID,
		Branch:        project.Branch,
		Cpu:           defaultDeploymentCPU,
		MemoryMb:      defaultDeploymentMemoryMB,
		Port:          project.Port,
		HealthCheck:   "/",
		Subdomain:     sql.NullString{String: resourceName, Valid: true},
		CommitSha:     nullString(payload.HeadCommit.ID),
		CommitMessage: nullString(firstCommitLine(payload.HeadCommit.Message)),
	})
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	envSnapshot, err := buildDeploymentEnvSnapshot(c.Request.Context(), qtx, project.ID, nil)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	for key, value := range envSnapshot {
		if _, err := qtx.CreateEnvVar(c.Request.Context(), dbpkg.CreateEnvVarParams{
			DeploymentID: deployment.ID,
			Key:          key,
			Value:        value,
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

	// 10. Publish to Queue
	if err := h.publisher.PublishBuildJob(c.Request.Context(), queue.BuildJobEvent{
		DeploymentID:   deployment.ID.String(),
		RepoURL:        project.RepoUrl,
		Branch:         project.Branch,
		DockerfilePath: project.DockerfilePath,
		UserToken:      user.AccessToken,
		Port:           int(project.Port),
		Subdomain:      resourceName,
		CPU:            defaultDeploymentCPU,
		MemoryMB:       defaultDeploymentMemoryMB,
		HealthCheck:    "/",
	}); err != nil {
		_, _ = h.queries.UpdateDeploymentStatus(c.Request.Context(), dbpkg.UpdateDeploymentStatusParams{
			ID:     deployment.ID,
			Status: "failed",
		})
		c.Status(http.StatusServiceUnavailable)
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"status": "deploying",
		"id":     deployment.ID,
	})
}

func matchWebhookProject(projects []dbpkg.Project, body []byte, signature string) (dbpkg.Project, bool) {
	for _, project := range projects {
		if project.WebhookSecret.Valid && project.WebhookSecret.String != "" {
			if verifySignature(body, project.WebhookSecret.String, signature) {
				return project, true
			}
			continue
		}
	}

	if signature != "" {
		return dbpkg.Project{}, false
	}

	for _, project := range projects {
		if !project.WebhookSecret.Valid || project.WebhookSecret.String == "" {
			return project, true
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
