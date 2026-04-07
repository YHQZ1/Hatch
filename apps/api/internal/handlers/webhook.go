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
		c.Status(http.StatusNoContent)
		return
	}

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

	project, err := h.queries.GetProjectByRepoURL(c.Request.Context(), payload.Repository.HTMLURL)
	if err != nil {
		c.Status(http.StatusAccepted)
		return
	}

	signature := c.GetHeader("X-Hub-Signature-256")
	if !project.WebhookSecret.Valid || !verifySignature(body, project.WebhookSecret.String, signature) {
		c.Status(http.StatusUnauthorized)
		return
	}

	targetRef := fmt.Sprintf("refs/heads/%s", project.Branch)
	if !project.AutoDeploy || payload.Ref != targetRef {
		c.Status(http.StatusNoContent)
		return
	}

	user, err := h.queries.GetUserByID(c.Request.Context(), project.UserID)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	resourceName := project.ID.String()[:8]
	if project.Subdomain.Valid {
		resourceName = project.Subdomain.String
	}

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

	c.JSON(http.StatusAccepted, gin.H{"status": "deploying", "id": deployment.ID})
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
