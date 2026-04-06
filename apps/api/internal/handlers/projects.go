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

	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ProjectHandler struct {
	queries        *dbpkg.Queries
	webhookBaseURL string
}

func NewProjectHandler(db *sql.DB, webhookBaseURL string) *ProjectHandler {
	return &ProjectHandler{
		queries:        dbpkg.New(db),
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch projects"})
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
		RepoName       string `json:"repo_name"       binding:"required"`
		RepoURL        string `json:"repo_url"        binding:"required"`
		Branch         string `json:"branch"`
		DockerfilePath string `json:"dockerfile_path" binding:"required"`
		Port           int32  `json:"port"            binding:"required"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

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
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create project"})
		return
	}

	// Async Webhook Registration
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

	if err := h.queries.DeleteProject(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete"})
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *ProjectHandler) registerGitHubWebhook(projectID uuid.UUID, repoURL, token string) {
	owner, repo, err := parseRepoURL(repoURL)
	secret, _ := generateSecret()
	if err != nil || secret == "" {
		return
	}

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
	if err != nil {
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusCreated {
		h.queries.UpdateProjectWebhook(context.Background(), dbpkg.UpdateProjectWebhookParams{
			ID:            projectID,
			WebhookSecret: sql.NullString{String: secret, Valid: true},
		})
	}
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
