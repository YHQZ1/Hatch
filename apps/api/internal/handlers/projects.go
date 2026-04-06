package handlers

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/YHQZ1/hatch/apps/api/internal/queue"
	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ProjectHandler struct {
	queries        *dbpkg.Queries
	publisher      *queue.Publisher
	webhookBaseURL string
}

func NewProjectHandler(db *sql.DB, publisher *queue.Publisher, webhookBaseURL string) *ProjectHandler {
	return &ProjectHandler{
		queries:        dbpkg.New(db),
		publisher:      publisher,
		webhookBaseURL: webhookBaseURL,
	}
}

func (h *ProjectHandler) ListProjects(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	projects, err := h.queries.GetProjectsByUserID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "fetch failed"})
		return
	}

	c.JSON(http.StatusOK, projects)
}

func (h *ProjectHandler) CreateProject(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var body struct {
		RepoName       string `json:"repo_name" binding:"required"`
		RepoURL        string `json:"repo_url" binding:"required"`
		Subdomain      string `json:"subdomain" binding:"required"`
		Branch         string `json:"branch"`
		DockerfilePath string `json:"dockerfile_path" binding:"required"`
		Port           int32  `json:"port" binding:"required"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing required fields"})
		return
	}

	subdomain := strings.ToLower(strings.TrimSpace(body.Subdomain))
	branch := body.Branch
	if branch == "" {
		branch = "main"
	}

	project, err := h.queries.CreateProject(c.Request.Context(), dbpkg.CreateProjectParams{
		UserID:         userID,
		RepoName:       body.RepoName,
		RepoUrl:        body.RepoURL,
		Branch:         branch,
		DockerfilePath: body.DockerfilePath,
		Port:           body.Port,
		Subdomain:      sql.NullString{String: subdomain, Valid: true},
	})

	if err != nil {
		if strings.Contains(err.Error(), "unique constraint") {
			c.JSON(http.StatusConflict, gin.H{"error": "subdomain already in use"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "creation failed"})
		return
	}

	h.recordActivity(c, userID, "CREATE", fmt.Sprintf("Project %s initialized", project.RepoName))

	if token, ok := c.Get("access_token"); ok {
		go h.registerGitHubWebhook(project.ID, body.RepoURL, token.(string))
	}

	c.JSON(http.StatusCreated, project)
}

func (h *ProjectHandler) GetProject(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	project, err := h.queries.GetProjectByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	c.JSON(http.StatusOK, project)
}

func (h *ProjectHandler) DeleteProject(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	project, err := h.queries.GetProjectByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	resourceName := project.ID.String()[:8]
	if project.Subdomain.Valid && project.Subdomain.String != "" {
		resourceName = project.Subdomain.String
	}

	h.publisher.PublishCleanupJob(c.Request.Context(), []string{resourceName})

	if err := h.queries.DeleteProject(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "deletion failed"})
		return
	}

	h.recordActivity(c, project.UserID, "DELETE", fmt.Sprintf("Infrastructure destroyed for %s", project.RepoName))
	c.Status(http.StatusNoContent)
}

func (h *ProjectHandler) registerGitHubWebhook(projectID uuid.UUID, repoURL, token string) {
	owner, repo, err := parseRepoURL(repoURL)
	if err != nil {
		return
	}

	secret, _ := generateSecret()
	payload := map[string]interface{}{
		"name":   "web",
		"active": true,
		"events": []string{"push"},
		"config": map[string]string{
			"url":          fmt.Sprintf("%s/webhooks/github", h.webhookBaseURL),
			"content_type": "json",
			"secret":       secret,
		},
	}

	body, _ := json.Marshal(payload)
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/hooks", owner, repo)

	req, _ := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusCreated {
		return
	}
	defer resp.Body.Close()

	_ = h.queries.UpdateProjectWebhook(context.Background(), dbpkg.UpdateProjectWebhookParams{
		ID:            projectID,
		WebhookSecret: sql.NullString{String: secret, Valid: true},
	})
}

func parseRepoURL(url string) (string, string, error) {
	trimmed := strings.TrimPrefix(url, "https://github.com/")
	parts := strings.Split(trimmed, "/")
	if len(parts) < 2 {
		return "", "", fmt.Errorf("invalid url")
	}
	return parts[0], parts[1], nil
}

func generateSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func (h *ProjectHandler) recordActivity(c *gin.Context, userID uuid.UUID, logType, message string) {
	go func() {
		_, _ = h.queries.CreateActivityLog(context.Background(), dbpkg.CreateActivityLogParams{
			UserID:  userID,
			Type:    logType,
			Message: message,
		})
	}()
}
