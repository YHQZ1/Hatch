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
	"strings"

	"github.com/YHQZ1/hatch/apps/api/internal/queue"
	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
	"github.com/gin-gonic/gin"
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

	// 4. Look up project
	project, err := h.queries.GetProjectByRepoURL(c.Request.Context(), repoURL)
	if err != nil {
		// If project doesn't exist, we return 202 to avoid GitHub retries
		c.Status(http.StatusAccepted)
		return
	}

	if !project.AutoDeploy {
		c.Status(http.StatusNoContent)
		return
	}

	// 5. FLEXIBLE SECURITY: Only verify if a secret is actually set in DB
	signature := c.GetHeader("X-Hub-Signature-256")
	if project.WebhookSecret.Valid && project.WebhookSecret.String != "" {
		if !verifySignature(body, project.WebhookSecret.String, signature) {
			fmt.Printf("[SECURITY] Signature mismatch for project: %s\n", project.ID)
			c.Status(http.StatusUnauthorized)
			return
		}
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
	deployment, err := h.queries.CreateDeployment(c.Request.Context(), dbpkg.CreateDeploymentParams{
		ProjectID:   project.ID,
		Branch:      project.Branch,
		Cpu:         512,
		MemoryMb:    1024,
		Port:        project.Port,
		HealthCheck: "/",
		Subdomain:   sql.NullString{String: resourceName, Valid: true},
	})
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	// 10. Publish to Queue
	h.publisher.PublishBuildJob(c.Request.Context(), queue.BuildJobEvent{
		DeploymentID:   deployment.ID.String(),
		RepoURL:        project.RepoUrl,
		Branch:         project.Branch,
		DockerfilePath: project.DockerfilePath,
		UserToken:      user.AccessToken,
		Port:           int(project.Port),
		Subdomain:      resourceName,
		CPU:            512,
		MemoryMB:       1024,
		HealthCheck:    "/",
	})

	c.JSON(http.StatusAccepted, gin.H{
		"status": "deploying",
		"id":     deployment.ID,
	})
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
