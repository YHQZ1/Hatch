package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/YHQZ1/hatch/apps/api/internal/queue"
	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type WebhookHandler struct {
	queries   *dbpkg.Queries
	publisher *queue.Publisher
}

func NewWebhookHandler(db *sql.DB, publisher *queue.Publisher) *WebhookHandler {
	return &WebhookHandler{
		queries:   dbpkg.New(db),
		publisher: publisher,
	}
}

type githubPushEvent struct {
	Ref        string `json:"ref"`
	Repository struct {
		HTMLURL string `json:"html_url"`
	} `json:"repository"`
}

func (h *WebhookHandler) HandlePush(c *gin.Context) {
	if c.GetHeader("X-GitHub-Event") != "push" {
		c.Status(http.StatusOK)
		return
	}

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "read error"})
		return
	}

	var payload githubPushEvent
	if err := json.Unmarshal(body, &payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	project, err := h.queries.GetProjectByRepoURL(c.Request.Context(), payload.Repository.HTMLURL)
	if err != nil {
		c.Status(http.StatusOK) // Project not found in Hatch
		return
	}

	// HMAC Signature Verification
	sig := c.GetHeader("X-Hub-Signature-256")
	if !project.WebhookSecret.Valid || !verifySignature(body, project.WebhookSecret.String, sig) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid signature"})
		return
	}

	// Guard clauses for Auto-Deploy
	if !project.AutoDeploy || payload.Ref != fmt.Sprintf("refs/heads/%s", project.Branch) {
		c.Status(http.StatusOK)
		return
	}

	user, err := h.queries.GetUserByID(c.Request.Context(), project.UserID)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	// Trigger Auto-Deployment
	subdomain := uuid.New().String()[:8]
	deployment, err := h.queries.CreateDeployment(c.Request.Context(), dbpkg.CreateDeploymentParams{
		ProjectID:   project.ID,
		Branch:      project.Branch,
		Cpu:         512,
		MemoryMb:    1024,
		Port:        project.Port,
		HealthCheck: "/health",
		Subdomain:   sql.NullString{String: subdomain, Valid: true},
	})
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	h.publisher.PublishBuildJob(c.Request.Context(), queue.BuildJobEvent{
		DeploymentID:   deployment.ID.String(),
		RepoURL:        project.RepoUrl,
		Branch:         project.Branch,
		DockerfilePath: project.DockerfilePath,
		UserToken:      user.AccessToken,
		Port:           int(project.Port),
	})

	c.JSON(http.StatusOK, gin.H{"deployment_id": deployment.ID, "status": "queued"})
}

func verifySignature(body []byte, secret, signature string) bool {
	if signature == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}
