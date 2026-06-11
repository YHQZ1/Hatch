package handlers

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"
	"time"

	"github.com/YHQZ1/hatch/apps/api/internal/queue"
	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
	"github.com/YHQZ1/hatch/packages/secrets"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ProjectHandler struct {
	queries        *dbpkg.Queries
	db             *sql.DB
	publisher      *queue.Publisher
	webhookBaseURL string
	secrets        *secrets.Codec
}

type ProjectResponse struct {
	ID                string  `json:"id"`
	UserID            string  `json:"user_id"`
	RepoName          string  `json:"repo_name"`
	RepoURL           string  `json:"repo_url"`
	AutoDeploy        bool    `json:"auto_deploy"`
	Branch            string  `json:"branch"`
	DockerfilePath    string  `json:"dockerfile_path"`
	Port              int32   `json:"port"`
	Subdomain         *string `json:"subdomain"`
	Status            string  `json:"status"`
	DeleteRequestedAt *string `json:"delete_requested_at"`
	DeleteError       *string `json:"delete_error"`
	CreatedAt         string  `json:"created_at"`
}

func NewProjectHandler(db *sql.DB, publisher *queue.Publisher, webhookBaseURL string, secretCodec *secrets.Codec) *ProjectHandler {
	return &ProjectHandler{
		queries:        dbpkg.New(db),
		db:             db,
		publisher:      publisher,
		webhookBaseURL: webhookBaseURL,
		secrets:        secretCodec,
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

	responses := make([]ProjectResponse, len(projects))
	for i, project := range projects {
		responses[i] = toProjectResponse(project)
	}
	c.JSON(http.StatusOK, responses)
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

	userToken, ok := accessTokenFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required: missing access token"})
		return
	}
	if err := validateGitHubDeployInputs(c.Request.Context(), repoURL, branch, dockerfilePath, userToken); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	secret, err := generateSecret()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate webhook secret"})
		return
	}
	storedSecret, err := h.secureWebhookSecret(secret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to secure webhook secret"})
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
		WebhookSecret:  sql.NullString{String: storedSecret, Valid: true},
	})

	if err != nil {
		if strings.Contains(err.Error(), "unique constraint") {
			c.JSON(http.StatusConflict, gin.H{"error": "subdomain already in use"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create project"})
		return
	}

	if err := h.replaceProjectEnvVars(c.Request.Context(), qtx, project.ID, body.EnvVars); err != nil {
		if isValidationError(err) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save environment variables"})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit project"})
		return
	}

	h.recordActivity(c, userID, "CREATE", fmt.Sprintf("Project %s initialized", project.RepoName))

	if userToken != "" {
		hookID, err := h.registerGitHubWebhook(repoURL, userToken, secret)
		if err != nil {
			log.Printf("failed to register GitHub webhook for project %s: %v", project.ID, err)
			_ = h.queries.UpdateProjectWebhook(c.Request.Context(), dbpkg.UpdateProjectWebhookParams{
				ID:              project.ID,
				WebhookSecret:   sql.NullString{String: storedSecret, Valid: true},
				GithubWebhookID: sql.NullInt64{},
				AutoDeploy:      false,
			})
			project.AutoDeploy = false
		} else {
			_ = h.queries.UpdateProjectWebhook(c.Request.Context(), dbpkg.UpdateProjectWebhookParams{
				ID:              project.ID,
				WebhookSecret:   sql.NullString{String: storedSecret, Valid: true},
				GithubWebhookID: sql.NullInt64{Int64: hookID, Valid: true},
				AutoDeploy:      true,
			})
			project.GithubWebhookID = sql.NullInt64{Int64: hookID, Valid: true}
		}
	}

	c.JSON(http.StatusCreated, toProjectResponse(project))
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

	c.JSON(http.StatusOK, toProjectResponse(project))
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

	userToken, ok := accessTokenFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required: missing access token"})
		return
	}
	if branch != current.Branch || dockerfilePath != current.DockerfilePath {
		if err := validateGitHubDeployInputs(c.Request.Context(), current.RepoUrl, branch, dockerfilePath, userToken); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	autoDeploy := current.AutoDeploy
	if body.AutoDeploy != nil {
		autoDeploy = *body.AutoDeploy
	}

	if current.AutoDeploy && !autoDeploy {
		if current.GithubWebhookID.Valid {
			if err := h.deleteGitHubWebhook(current.RepoUrl, userToken, current.GithubWebhookID.Int64); err != nil {
				c.JSON(http.StatusBadGateway, gin.H{
					"error": "auto-deploy could not be disabled because Hatch could not remove the GitHub webhook",
				})
				return
			}
		}
		if err := h.queries.ClearProjectWebhook(c.Request.Context(), projectID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to clear webhook state"})
			return
		}
	}

	if autoDeploy && !current.AutoDeploy {
		secret := ""
		if current.WebhookSecret.Valid {
			secret, err = h.secrets.Decrypt(current.WebhookSecret.String)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load webhook secret"})
				return
			}
			secret = strings.TrimSpace(secret)
		}
		if secret == "" {
			secret, err = generateSecret()
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate webhook secret"})
				return
			}
			storedSecret, err := h.secureWebhookSecret(secret)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to secure webhook secret"})
				return
			}
			if err := h.queries.UpdateProjectWebhook(c.Request.Context(), dbpkg.UpdateProjectWebhookParams{
				ID:              projectID,
				WebhookSecret:   sql.NullString{String: storedSecret, Valid: true},
				GithubWebhookID: current.GithubWebhookID,
				AutoDeploy:      current.AutoDeploy,
			}); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save webhook secret"})
				return
			}
		}

		hookID, err := h.registerGitHubWebhook(current.RepoUrl, userToken, secret)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"error": "auto-deploy could not be enabled because Hatch could not register the GitHub webhook",
			})
			return
		}
		storedSecret, err := h.secureWebhookSecret(secret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to secure webhook secret"})
			return
		}
		if err := h.queries.UpdateProjectWebhook(c.Request.Context(), dbpkg.UpdateProjectWebhookParams{
			ID:              projectID,
			WebhookSecret:   sql.NullString{String: storedSecret, Valid: true},
			GithubWebhookID: sql.NullInt64{Int64: hookID, Valid: true},
			AutoDeploy:      true,
		}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save webhook state"})
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
	c.JSON(http.StatusOK, toProjectResponse(project))
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

	response, err := h.projectEnvVarsResponse(envVars)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to decrypt environment variables"})
		return
	}
	c.JSON(http.StatusOK, response)
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
	if err := h.replaceProjectEnvVars(c.Request.Context(), qtx, projectID, body.EnvVars); err != nil {
		if isValidationError(err) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
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

	response, err := h.projectEnvVarsResponse(envVars)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to decrypt environment variables"})
		return
	}
	c.JSON(http.StatusOK, response)
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
	if tokenRaw, ok := c.Get("access_token"); ok && project.GithubWebhookID.Valid {
		if token, ok := tokenRaw.(string); ok && token != "" {
			if err := h.deleteGitHubWebhook(project.RepoUrl, token, project.GithubWebhookID.Int64); err != nil {
				log.Printf("failed to delete GitHub webhook for project %s: %v", project.ID, err)
			}
		}
	}

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
	c.JSON(http.StatusAccepted, toProjectResponse(project))
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
		c.JSON(http.StatusOK, toProjectResponse(project))
		return
	}
	if action == "resume" && project.Status == "active" {
		c.JSON(http.StatusOK, toProjectResponse(project))
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
	c.JSON(http.StatusAccepted, toProjectResponse(project))
}

func toProjectResponse(project dbpkg.Project) ProjectResponse {
	response := ProjectResponse{
		ID:             project.ID.String(),
		UserID:         project.UserID.String(),
		RepoName:       project.RepoName,
		RepoURL:        project.RepoUrl,
		AutoDeploy:     project.AutoDeploy,
		Branch:         project.Branch,
		DockerfilePath: project.DockerfilePath,
		Port:           project.Port,
		Status:         project.Status,
		CreatedAt:      project.CreatedAt.Format(time.RFC3339),
	}
	if project.Subdomain.Valid {
		response.Subdomain = &project.Subdomain.String
	}
	if project.DeleteRequestedAt.Valid {
		value := project.DeleteRequestedAt.Time.Format(time.RFC3339)
		response.DeleteRequestedAt = &value
	}
	if project.DeleteError.Valid {
		response.DeleteError = &project.DeleteError.String
	}
	return response
}

func projectResourceName(project dbpkg.Project) string {
	resourceName := project.ID.String()[:8]
	if project.Subdomain.Valid && project.Subdomain.String != "" {
		resourceName = project.Subdomain.String
	}
	return resourceName
}

type githubHook struct {
	ID     int64             `json:"id"`
	Config map[string]string `json:"config"`
}

type githubContentMetadata struct {
	Type string `json:"type"`
}

func validateGitHubDeployInputs(ctx context.Context, repoURL, branch, dockerfilePath, token string) error {
	owner, repo, err := parseRepoURL(repoURL)
	if err != nil {
		return err
	}
	if branch == "" {
		return fmt.Errorf("branch is required")
	}
	if token == "" {
		return fmt.Errorf("authentication required: missing access token")
	}

	branchURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/branches/%s", owner, repo, url.PathEscape(branch))
	branchStatus, branchBody, err := githubGet(ctx, branchURL, token)
	if err != nil {
		return err
	}
	if branchStatus == http.StatusNotFound {
		return fmt.Errorf("branch %q was not found or is not accessible", branch)
	}
	if branchStatus < 200 || branchStatus >= 300 {
		return fmt.Errorf("github branch check failed with status %d: %s", branchStatus, branchBody)
	}

	dockerfileURL := fmt.Sprintf(
		"https://api.github.com/repos/%s/%s/contents/%s?ref=%s",
		owner,
		repo,
		escapeGitHubPath(dockerfilePath),
		url.QueryEscape(branch),
	)
	dockerfileStatus, dockerfileBody, err := githubGet(ctx, dockerfileURL, token)
	if err != nil {
		return err
	}
	if dockerfileStatus == http.StatusNotFound {
		return fmt.Errorf("Dockerfile not found at %q on branch %q", dockerfilePath, branch)
	}
	if dockerfileStatus < 200 || dockerfileStatus >= 300 {
		return fmt.Errorf("github Dockerfile check failed with status %d: %s", dockerfileStatus, dockerfileBody)
	}

	var content githubContentMetadata
	if err := json.Unmarshal([]byte(dockerfileBody), &content); err == nil && content.Type != "" && content.Type != "file" {
		return fmt.Errorf("Dockerfile path %q is not a file", dockerfilePath)
	}
	return nil
}

func accessTokenFromContext(c *gin.Context) (string, bool) {
	tokenRaw, ok := c.Get("access_token")
	if !ok {
		return "", false
	}
	token, ok := tokenRaw.(string)
	return token, ok && token != ""
}

func escapeGitHubPath(value string) string {
	parts := strings.Split(value, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

func githubGet(ctx context.Context, endpoint, token string) (int, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := outboundHTTPClient.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
	return resp.StatusCode, strings.TrimSpace(string(body)), nil
}

func (h *ProjectHandler) registerGitHubWebhook(repoURL, token, secret string) (int64, error) {
	owner, repo, err := parseRepoURL(repoURL)
	if err != nil {
		return 0, err
	}

	webhookURL := fmt.Sprintf("%s/api/webhooks/github", h.webhookBaseURL)
	payload := map[string]interface{}{
		"name":   "web",
		"active": true,
		"events": []string{"push"},
		"config": map[string]string{
			"url":          webhookURL,
			"content_type": "json",
			"secret":       secret,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return 0, err
	}

	if existingHookID, ok, err := h.findGitHubWebhook(owner, repo, token, webhookURL); err != nil {
		return 0, err
	} else if ok {
		return existingHookID, h.updateGitHubWebhook(owner, repo, token, existingHookID, body)
	}

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/hooks", owner, repo)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := outboundHTTPClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK {
		var hook githubHook
		if err := json.NewDecoder(resp.Body).Decode(&hook); err != nil {
			return 0, err
		}
		return hook.ID, nil
	}
	if resp.StatusCode == http.StatusUnprocessableEntity {
		existingHookID, ok, err := h.findGitHubWebhook(owner, repo, token, webhookURL)
		if err != nil {
			return 0, err
		}
		if ok {
			return existingHookID, h.updateGitHubWebhook(owner, repo, token, existingHookID, body)
		}
	}

	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	return 0, fmt.Errorf("github webhook registration failed with status %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
}

func (h *ProjectHandler) findGitHubWebhook(owner, repo, token, webhookURL string) (int64, bool, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/hooks?per_page=100", owner, repo)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return 0, false, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := outboundHTTPClient.Do(req)
	if err != nil {
		return 0, false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return 0, false, fmt.Errorf("github webhook lookup failed with status %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
	}

	var hooks []githubHook
	if err := json.NewDecoder(resp.Body).Decode(&hooks); err != nil {
		return 0, false, err
	}
	for _, hook := range hooks {
		if hook.Config["url"] == webhookURL {
			return hook.ID, true, nil
		}
	}
	return 0, false, nil
}

func (h *ProjectHandler) updateGitHubWebhook(owner, repo, token string, hookID int64, body []byte) error {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/hooks/%d", owner, repo, hookID)
	req, err := http.NewRequest(http.MethodPatch, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := outboundHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	return fmt.Errorf("github webhook update failed with status %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
}

func (h *ProjectHandler) deleteGitHubWebhook(repoURL, token string, hookID int64) error {
	owner, repo, err := parseRepoURL(repoURL)
	if err != nil {
		return err
	}
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/hooks/%d", owner, repo, hookID)
	req, err := http.NewRequest(http.MethodDelete, url, nil)
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
	if resp.StatusCode == http.StatusNoContent || resp.StatusCode == http.StatusNotFound {
		return nil
	}
	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	return fmt.Errorf("github webhook deletion failed with status %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
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
var envVarKeyPattern = regexp.MustCompile(`^[A-Z_][A-Z0-9_]*$`)

const (
	maxEnvVars        = 100
	maxEnvKeyLength   = 128
	maxEnvValueLength = 32 * 1024
)

type validationError struct {
	message string
}

func (e validationError) Error() string {
	return e.message
}

func isValidationError(err error) bool {
	var target validationError
	return errors.As(err, &target)
}

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

func (h *ProjectHandler) replaceProjectEnvVars(ctx context.Context, q *dbpkg.Queries, projectID uuid.UUID, envVars map[string]string) error {
	normalizedEnvVars, err := normalizeEnvVars(envVars)
	if err != nil {
		return err
	}
	if err := q.DeleteProjectEnvVarsByProject(ctx, projectID); err != nil {
		return err
	}
	for key, value := range normalizedEnvVars {
		storedValue, err := h.secrets.Encrypt(value)
		if err != nil {
			return err
		}
		if _, err := q.CreateProjectEnvVar(ctx, dbpkg.CreateProjectEnvVarParams{
			ProjectID: projectID,
			Key:       key,
			Value:     storedValue,
			SecretArn: sql.NullString{},
		}); err != nil {
			return err
		}
	}
	return nil
}

func (h *ProjectHandler) secureWebhookSecret(secret string) (string, error) {
	return h.secrets.Encrypt(strings.TrimSpace(secret))
}

func normalizeEnvVars(envVars map[string]string) (map[string]string, error) {
	if len(envVars) > maxEnvVars {
		return nil, validationError{message: fmt.Sprintf("environment variables cannot exceed %d entries", maxEnvVars)}
	}

	normalized := make(map[string]string)
	for key, value := range envVars {
		cleanKey := strings.ToUpper(strings.TrimSpace(key))
		if cleanKey == "" {
			continue
		}
		if len(cleanKey) > maxEnvKeyLength {
			return nil, validationError{message: fmt.Sprintf("environment variable %q is too long", cleanKey)}
		}
		if !envVarKeyPattern.MatchString(cleanKey) {
			return nil, validationError{message: fmt.Sprintf("environment variable %q must start with a letter or underscore and contain only letters, numbers, and underscores", cleanKey)}
		}
		if len(value) > maxEnvValueLength {
			return nil, validationError{message: fmt.Sprintf("environment variable %q exceeds the %d byte value limit", cleanKey, maxEnvValueLength)}
		}
		normalized[cleanKey] = value
	}
	return normalized, nil
}

func (h *ProjectHandler) projectEnvVarsResponse(envVars []dbpkg.ProjectEnvVar) ([]gin.H, error) {
	response := make([]gin.H, len(envVars))
	for i, envVar := range envVars {
		value, err := h.secrets.Decrypt(envVar.Value)
		if err != nil {
			return nil, err
		}
		response[i] = gin.H{
			"id":         envVar.ID.String(),
			"project_id": envVar.ProjectID.String(),
			"key":        envVar.Key,
			"value":      value,
			"created_at": envVar.CreatedAt,
			"updated_at": envVar.UpdatedAt,
		}
	}
	return response, nil
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
