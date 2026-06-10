package handlers

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path"
	"regexp"
	"strings"

	"github.com/YHQZ1/hatch/apps/api/internal/queue"
	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ProjectHandler struct {
	queries        *dbpkg.Queries
	db             *sql.DB
	publisher      *queue.Publisher
	webhookBaseURL string
}

func NewProjectHandler(db *sql.DB, publisher *queue.Publisher, webhookBaseURL string) *ProjectHandler {
	return &ProjectHandler{
		queries:        dbpkg.New(db),
		db:             db,
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
		RepoName       string            `json:"repo_name" binding:"required"`
		RepoURL        string            `json:"repo_url" binding:"required"`
		Subdomain      string            `json:"subdomain" binding:"required"`
		Branch         string            `json:"branch"`
		DockerfilePath string            `json:"dockerfile_path" binding:"required"`
		Port           int32             `json:"port" binding:"required"`
		EnvVars        map[string]string `json:"env_vars"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing required fields"})
		return
	}

	repoURL, err := normalizeGitHubRepoURL(body.RepoURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "repo_url must be a valid GitHub repository URL"})
		return
	}

	subdomain, err := normalizeSubdomain(body.Subdomain)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branch := normalizeBranch(body.Branch)
	if branch == "" {
		branch = "main"
	}

	dockerfilePath, err := normalizeDockerfilePath(body.DockerfilePath)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Port < 1 || body.Port > 65535 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "port must be between 1 and 65535"})
		return
	}

	secret, err := generateSecret()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate webhook secret"})
		return
	}

	tx, err := h.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start project transaction"})
		return
	}
	defer tx.Rollback()

	qtx := h.queries.WithTx(tx)
	project, err := qtx.CreateProject(c.Request.Context(), dbpkg.CreateProjectParams{
		UserID:         userID,
		RepoName:       body.RepoName,
		RepoUrl:        repoURL,
		Branch:         branch,
		DockerfilePath: dockerfilePath,
		Port:           body.Port,
		Subdomain:      sql.NullString{String: subdomain, Valid: true},
		WebhookSecret:  sql.NullString{String: secret, Valid: true},
	})

	if err != nil {
		if strings.Contains(err.Error(), "unique constraint") {
			c.JSON(http.StatusConflict, gin.H{"error": "subdomain already in use"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create project"})
		return
	}

	if err := replaceProjectEnvVars(c.Request.Context(), qtx, project.ID, body.EnvVars); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save environment variables"})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit project"})
		return
	}

	h.recordActivity(c, userID, "CREATE", fmt.Sprintf("Project %s initialized", project.RepoName))

	if token, ok := c.Get("access_token"); ok {
		go func() {
			if err := h.registerGitHubWebhook(project.ID, repoURL, token.(string), secret); err != nil {
				log.Printf("failed to register GitHub webhook for project %s: %v", project.ID, err)
			}
		}()
	}

	c.JSON(http.StatusCreated, project)
}

func (h *ProjectHandler) GetProject(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	project, err := h.queries.GetProjectByIDAndUserID(c.Request.Context(), dbpkg.GetProjectByIDAndUserIDParams{
		ID:     id,
		UserID: userID,
	})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	c.JSON(http.StatusOK, project)
}

func (h *ProjectHandler) UpdateProject(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var body struct {
		RepoName       string `json:"repo_name"`
		Branch         string `json:"branch"`
		DockerfilePath string `json:"dockerfile_path"`
		Port           int32  `json:"port"`
		AutoDeploy     *bool  `json:"auto_deploy"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	current, err := h.queries.GetProjectByIDAndUserID(c.Request.Context(), dbpkg.GetProjectByIDAndUserIDParams{
		ID:     projectID,
		UserID: userID,
	})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	repoName := strings.TrimSpace(body.RepoName)
	if repoName == "" {
		repoName = current.RepoName
	}

	branch := normalizeBranch(body.Branch)
	if branch == "" {
		branch = current.Branch
	}

	dockerfilePath, err := normalizeDockerfilePath(body.DockerfilePath)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if dockerfilePath == "" {
		dockerfilePath = current.DockerfilePath
	}

	port := body.Port
	if port <= 0 {
		port = current.Port
	}
	if port < 1 || port > 65535 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "port must be between 1 and 65535"})
		return
	}

	autoDeploy := current.AutoDeploy
	if body.AutoDeploy != nil {
		autoDeploy = *body.AutoDeploy
	}

	if autoDeploy && !current.AutoDeploy {
		tokenRaw, ok := c.Get("access_token")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required: missing access token"})
			return
		}
		userToken, ok := tokenRaw.(string)
		if !ok || userToken == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required: invalid access token"})
			return
		}

		secret := current.WebhookSecret.String
		if !current.WebhookSecret.Valid || strings.TrimSpace(secret) == "" {
			secret, err = generateSecret()
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate webhook secret"})
				return
			}
			if err := h.queries.UpdateProjectWebhook(c.Request.Context(), dbpkg.UpdateProjectWebhookParams{
				ID:            projectID,
				WebhookSecret: sql.NullString{String: secret, Valid: true},
			}); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save webhook secret"})
				return
			}
		}

		if err := h.registerGitHubWebhook(projectID, current.RepoUrl, userToken, secret); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"error": "auto-deploy could not be enabled because Hatch could not register the GitHub webhook",
			})
			return
		}
	}

	project, err := h.queries.UpdateProjectSettings(c.Request.Context(), dbpkg.UpdateProjectSettingsParams{
		ID:             projectID,
		UserID:         userID,
		RepoName:       repoName,
		Branch:         branch,
		DockerfilePath: dockerfilePath,
		Port:           port,
		AutoDeploy:     autoDeploy,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update project"})
		return
	}

	h.recordActivity(c, userID, "UPDATE", fmt.Sprintf("Settings updated for %s", project.RepoName))
	c.JSON(http.StatusOK, project)
}

func (h *ProjectHandler) GetProjectEnvVars(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if _, err := h.queries.GetProjectByIDAndUserID(c.Request.Context(), dbpkg.GetProjectByIDAndUserIDParams{
		ID:     projectID,
		UserID: userID,
	}); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	envVars, err := h.queries.GetProjectEnvVarsByProject(c.Request.Context(), projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch environment variables"})
		return
	}

	c.JSON(http.StatusOK, projectEnvVarsResponse(envVars))
}

func (h *ProjectHandler) UpdateProjectEnvVars(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var body struct {
		EnvVars map[string]string `json:"env_vars"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if _, err := h.queries.GetProjectByIDAndUserID(c.Request.Context(), dbpkg.GetProjectByIDAndUserIDParams{
		ID:     projectID,
		UserID: userID,
	}); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	tx, err := h.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start environment transaction"})
		return
	}
	defer tx.Rollback()

	qtx := h.queries.WithTx(tx)
	if err := replaceProjectEnvVars(c.Request.Context(), qtx, projectID, body.EnvVars); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save environment variables"})
		return
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit environment variables"})
		return
	}

	envVars, err := h.queries.GetProjectEnvVarsByProject(c.Request.Context(), projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch environment variables"})
		return
	}

	c.JSON(http.StatusOK, projectEnvVarsResponse(envVars))
}

func (h *ProjectHandler) DeleteProject(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	project, err := h.queries.GetProjectByIDAndUserID(c.Request.Context(), dbpkg.GetProjectByIDAndUserIDParams{
		ID:     id,
		UserID: userID,
	})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	resourceName := projectResourceName(project)

	project, err = h.queries.MarkProjectDeleting(c.Request.Context(), dbpkg.MarkProjectDeletingParams{
		ID:     id,
		UserID: userID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to mark project for deletion"})
		return
	}

	if err := h.publisher.PublishCleanupJob(c.Request.Context(), queue.CleanupJobEvent{
		ProjectID: project.ID.String(),
		Slug:      resourceName,
	}); err != nil {
		_ = h.queries.MarkProjectDeleteFailed(c.Request.Context(), dbpkg.MarkProjectDeleteFailedParams{
			ID:          id,
			DeleteError: sql.NullString{String: "failed to queue cleanup", Valid: true},
		})
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "failed to queue cleanup"})
		return
	}

	h.recordActivity(c, userID, "DELETE", fmt.Sprintf("Deletion queued for %s", project.RepoName))
	c.JSON(http.StatusAccepted, project)
}

func (h *ProjectHandler) SuspendProject(c *gin.Context) {
	h.handleServiceControl(c, "suspend", "suspending")
}

func (h *ProjectHandler) ResumeProject(c *gin.Context) {
	h.handleServiceControl(c, "resume", "resuming")
}

func (h *ProjectHandler) handleServiceControl(c *gin.Context, action, nextStatus string) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	project, err := h.queries.GetProjectByIDAndUserID(c.Request.Context(), dbpkg.GetProjectByIDAndUserIDParams{
		ID:     id,
		UserID: userID,
	})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	if project.Status == "deleting" {
		c.JSON(http.StatusConflict, gin.H{"error": "project is being deleted"})
		return
	}
	if action == "suspend" && project.Status == "suspended" {
		c.JSON(http.StatusOK, project)
		return
	}
	if action == "resume" && project.Status == "active" {
		c.JSON(http.StatusOK, project)
		return
	}

	resourceName := projectResourceName(project)
	project, err = h.queries.UpdateProjectLifecycleStatus(c.Request.Context(), dbpkg.UpdateProjectLifecycleStatusParams{
		ID:     id,
		UserID: userID,
		Status: nextStatus,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update project status"})
		return
	}

	if err := h.publisher.PublishServiceControlJob(c.Request.Context(), queue.ServiceControlJobEvent{
		ProjectID: project.ID.String(),
		Slug:      resourceName,
		Action:    action,
	}); err != nil {
		failedStatus := "suspend_failed"
		if action == "resume" {
			failedStatus = "resume_failed"
		}
		_ = h.queries.MarkProjectOperationFailed(c.Request.Context(), dbpkg.MarkProjectOperationFailedParams{
			ID:          id,
			Status:      failedStatus,
			DeleteError: sql.NullString{String: "failed to queue service operation", Valid: true},
		})
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "failed to queue service operation"})
		return
	}

	activityVerb := "Suspend"
	if action == "resume" {
		activityVerb = "Resume"
	}
	h.recordActivity(c, userID, "UPDATE", fmt.Sprintf("%s queued for %s", activityVerb, project.RepoName))
	c.JSON(http.StatusAccepted, project)
}

func projectResourceName(project dbpkg.Project) string {
	resourceName := project.ID.String()[:8]
	if project.Subdomain.Valid && project.Subdomain.String != "" {
		resourceName = project.Subdomain.String
	}
	return resourceName
}

func (h *ProjectHandler) registerGitHubWebhook(projectID uuid.UUID, repoURL, token, secret string) error {
	owner, repo, err := parseRepoURL(repoURL)
	if err != nil {
		return err
	}

	payload := map[string]interface{}{
		"name":   "web",
		"active": true,
		"events": []string{"push"},
		"config": map[string]string{
			"url":          fmt.Sprintf("%s/api/webhooks/github", h.webhookBaseURL),
			"content_type": "json",
			"secret":       secret,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/hooks", owner, repo)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := outboundHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK {
		return nil
	}
	if resp.StatusCode == http.StatusUnprocessableEntity {
		return nil
	}

	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	return fmt.Errorf("github webhook registration failed with status %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
}

func parseRepoURL(url string) (string, string, error) {
	normalized, err := normalizeGitHubRepoURL(url)
	if err != nil {
		return "", "", err
	}
	trimmed := strings.TrimPrefix(normalized, "https://github.com/")
	parts := strings.Split(trimmed, "/")
	if len(parts) < 2 {
		return "", "", fmt.Errorf("invalid github url")
	}
	return parts[0], parts[1], nil
}

func normalizeGitHubRepoURL(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	trimmed = strings.TrimPrefix(trimmed, "git@github.com:")
	trimmed = strings.TrimPrefix(trimmed, "https://github.com/")
	trimmed = strings.TrimPrefix(trimmed, "http://github.com/")
	trimmed = strings.TrimSuffix(trimmed, ".git")
	trimmed = strings.Trim(trimmed, "/")

	parts := strings.Split(trimmed, "/")
	if len(parts) < 2 || parts[0] == "" || parts[1] == "" {
		return "", fmt.Errorf("invalid github url")
	}

	return fmt.Sprintf("https://github.com/%s/%s", parts[0], parts[1]), nil
}

var subdomainPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)

var reservedSubdomains = map[string]struct{}{
	"admin":   {},
	"api":     {},
	"app":     {},
	"auth":    {},
	"console": {},
	"docs":    {},
	"status":  {},
	"support": {},
	"www":     {},
}

func normalizeSubdomain(raw string) (string, error) {
	subdomain := strings.ToLower(strings.TrimSpace(raw))
	if subdomain == "" {
		return "", fmt.Errorf("subdomain is required")
	}
	if _, reserved := reservedSubdomains[subdomain]; reserved {
		return "", fmt.Errorf("subdomain is reserved")
	}
	if !subdomainPattern.MatchString(subdomain) {
		return "", fmt.Errorf("subdomain must be 1-63 characters and contain only lowercase letters, numbers, and hyphens")
	}
	return subdomain, nil
}

func normalizeBranch(raw string) string {
	return strings.TrimSpace(raw)
}

func normalizeDockerfilePath(raw string) (string, error) {
	cleaned := strings.TrimSpace(raw)
	if cleaned == "" {
		return "", nil
	}
	if strings.Contains(cleaned, "\\") || strings.HasPrefix(cleaned, "/") || strings.Contains(cleaned, "\x00") {
		return "", fmt.Errorf("dockerfile path must be a relative repository path")
	}

	cleaned = strings.TrimPrefix(cleaned, "./")
	cleaned = strings.Trim(cleaned, "/")
	if cleaned == "" || cleaned == "." {
		return "Dockerfile", nil
	}

	normalized := path.Clean(cleaned)
	if normalized == "." {
		return "Dockerfile", nil
	}
	if normalized == ".." || strings.HasPrefix(normalized, "../") {
		return "", fmt.Errorf("dockerfile path cannot leave the repository")
	}
	if strings.HasSuffix(normalized, "/Dockerfile") || normalized == "Dockerfile" {
		return normalized, nil
	}
	return normalized + "/Dockerfile", nil
}

func replaceProjectEnvVars(ctx context.Context, q *dbpkg.Queries, projectID uuid.UUID, envVars map[string]string) error {
	if err := q.DeleteProjectEnvVarsByProject(ctx, projectID); err != nil {
		return err
	}
	for key, value := range normalizeEnvVars(envVars) {
		if _, err := q.CreateProjectEnvVar(ctx, dbpkg.CreateProjectEnvVarParams{
			ProjectID: projectID,
			Key:       key,
			Value:     value,
			SecretArn: sql.NullString{},
		}); err != nil {
			return err
		}
	}
	return nil
}

func normalizeEnvVars(envVars map[string]string) map[string]string {
	normalized := make(map[string]string)
	for key, value := range envVars {
		cleanKey := strings.ToUpper(strings.TrimSpace(key))
		cleanKey = strings.ReplaceAll(cleanKey, " ", "_")
		if cleanKey == "" {
			continue
		}
		normalized[cleanKey] = value
	}
	return normalized
}

func projectEnvVarsResponse(envVars []dbpkg.ProjectEnvVar) []gin.H {
	response := make([]gin.H, len(envVars))
	for i, envVar := range envVars {
		response[i] = gin.H{
			"id":         envVar.ID.String(),
			"project_id": envVar.ProjectID.String(),
			"key":        envVar.Key,
			"value":      envVar.Value,
			"created_at": envVar.CreatedAt,
			"updated_at": envVar.UpdatedAt,
		}
	}
	return response
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
