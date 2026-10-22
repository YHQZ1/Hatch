package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"
	"time"

	"github.com/YHQZ1/hatch/internal/api/auth"
	"github.com/YHQZ1/hatch/internal/jobs"
	"github.com/YHQZ1/hatch/internal/secrets"
	"github.com/YHQZ1/hatch/internal/store"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ProjectHandler struct {
	queries *dbpkg.Queries
	pool    *pgxpool.Pool
	jobs    jobs.Inserter
	secrets *secrets.Codec
	// tokens reads repositories through the GitHub App; githubAPI is where.
	tokens    InstallationTokens
	githubAPI string
	// userToken is the signed-in user's own GitHub token. It is how Hatch knows the
	// user may use a repository (see requireRepoAccess); tests replace it.
	userToken func(*gin.Context) (string, bool)
	// webhooks is whether the GitHub App's webhook is set up, so that a push
	// can deploy a project at all.
	webhooks bool
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
	HealthCheck       string  `json:"health_check"`
	Subdomain         *string `json:"subdomain"`
	Status            string  `json:"status"`
	DeleteRequestedAt *string `json:"delete_requested_at"`
	DeleteError       *string `json:"delete_error"`
	CreatedAt         string  `json:"created_at"`
}

// NewProjectHandler serves projects. tokens reads their repositories through
// the GitHub App; webhooksEnabled says whether the App's webhook is set up, which
// is what lets a push deploy a project.
func NewProjectHandler(pool *pgxpool.Pool, inserter jobs.Inserter, secretCodec *secrets.Codec, tokens InstallationTokens, webhooksEnabled bool) *ProjectHandler {
	return &ProjectHandler{
		queries:   dbpkg.New(pool),
		pool:      pool,
		jobs:      inserter,
		secrets:   secretCodec,
		tokens:    tokens,
		githubAPI: "https://api.github.com",
		userToken: accessTokenFromContext,
		webhooks:  webhooksEnabled,
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
		HealthCheck    string            `json:"health_check"`
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

	healthCheck, err := normalizeHealthCheckPath(body.HealthCheck)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// First, that the signed-in user may use this repository. The App can read every
	// repository it is installed on, whoever installed it, so without this one
	// user could deploy another's private repository.
	if status, message := h.requireRepoAccess(c, repoURL); message != "" {
		c.JSON(status, gin.H{"error": message})
		return
	}
	// Then, that Hatch can read it as the GitHub App, as the build will, so a
	// project that passes this can be built.
	token, access := tokenForRepo(c.Request.Context(), h.tokens, repoURL, http.StatusBadRequest)
	if access != nil {
		c.JSON(access.status, gin.H{"error": access.message})
		return
	}
	if err := validateGitHubDeployInputs(c.Request.Context(), h.githubAPI, repoURL, branch, dockerfilePath, token); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tx, err := h.pool.Begin(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start project transaction"})
		return
	}
	defer func() { _ = tx.Rollback(c.Request.Context()) }()

	qtx := h.queries.WithTx(tx)
	project, err := qtx.CreateProject(c.Request.Context(), dbpkg.CreateProjectParams{
		UserID:         userID,
		RepoName:       body.RepoName,
		RepoUrl:        repoURL,
		Branch:         branch,
		DockerfilePath: dockerfilePath,
		Port:           body.Port,
		Subdomain:      ptr(subdomain),
		HealthCheck:    healthCheck,
		// A push deploys the project when the App's webhook is set up.
		AutoDeploy: h.webhooks,
	})

	if err != nil {
		if store.IsUniqueViolation(err) {
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

	if err := tx.Commit(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit project"})
		return
	}

	h.recordActivity(c, userID, "CREATE", fmt.Sprintf("Project %s initialized", project.RepoName))

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
		HealthCheck    string `json:"health_check"`
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

	healthCheck, err := effectiveHealthCheck(body.HealthCheck, current.HealthCheck)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if branch != current.Branch || dockerfilePath != current.DockerfilePath {
		token, access := tokenForRepo(c.Request.Context(), h.tokens, current.RepoUrl, http.StatusConflict)
		if access != nil {
			c.JSON(access.status, gin.H{"error": access.message})
			return
		}
		if err := validateGitHubDeployInputs(c.Request.Context(), h.githubAPI, current.RepoUrl, branch, dockerfilePath, token); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	autoDeploy := current.AutoDeploy
	if body.AutoDeploy != nil {
		autoDeploy = *body.AutoDeploy
	}
	// Turning it on is refused where nothing could deliver a push. Turning it off,
	// or leaving a setting from before alone, is always fine.
	if autoDeploy && !current.AutoDeploy && !h.webhooks {
		c.JSON(http.StatusConflict, gin.H{"error": "This Hatch server has no GitHub webhook set up (GITHUB_WEBHOOK_SECRET), so a push cannot deploy a project. See docs/07-github-app-setup.md."})
		return
	}

	project, err := h.queries.UpdateProjectSettings(c.Request.Context(), dbpkg.UpdateProjectSettingsParams{
		ID:             projectID,
		UserID:         userID,
		RepoName:       repoName,
		Branch:         branch,
		DockerfilePath: dockerfilePath,
		Port:           port,
		AutoDeploy:     autoDeploy,
		HealthCheck:    healthCheck,
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

	tx, err := h.pool.Begin(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start environment transaction"})
		return
	}
	defer func() { _ = tx.Rollback(c.Request.Context()) }()

	qtx := h.queries.WithTx(tx)
	if err := h.replaceProjectEnvVars(c.Request.Context(), qtx, projectID, body.EnvVars); err != nil {
		if isValidationError(err) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save environment variables"})
		return
	}
	if err := tx.Commit(c.Request.Context()); err != nil {
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
	if project.Status == "deleting" {
		c.JSON(http.StatusAccepted, toProjectResponse(project))
		return
	}
	if project.Status == "deleted" {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	resourceName := projectResourceName(project)
	// Marking the project deleting and queuing the cleanup commit together.
	tx, err := h.pool.Begin(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start project deletion"})
		return
	}
	defer func() { _ = tx.Rollback(c.Request.Context()) }()

	project, err = h.queries.WithTx(tx).MarkProjectDeleting(c.Request.Context(), dbpkg.MarkProjectDeletingParams{
		ID:     id,
		UserID: userID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to mark project for deletion"})
		return
	}
	if _, err := h.jobs.InsertTx(c.Request.Context(), tx, jobs.DestroyAppArgs{
		ProjectID: project.ID,
		Subdomain: resourceName,
	}, nil); err != nil {
		slog.ErrorContext(c.Request.Context(), "failed to queue project cleanup", "project_id", id, "error", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "failed to queue cleanup"})
		return
	}
	if err := tx.Commit(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to mark project for deletion"})
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
	switch action {
	case "suspend":
		if project.Status == "suspended" {
			c.JSON(http.StatusOK, toProjectResponse(project))
			return
		}
		if project.Status == "suspending" {
			c.JSON(http.StatusAccepted, toProjectResponse(project))
			return
		}
		if project.Status != "active" && project.Status != "suspend_failed" {
			c.JSON(http.StatusConflict, gin.H{"error": "project cannot be suspended from its current state"})
			return
		}
	case "resume":
		if project.Status == "active" {
			c.JSON(http.StatusOK, toProjectResponse(project))
			return
		}
		if project.Status == "resuming" {
			c.JSON(http.StatusAccepted, toProjectResponse(project))
			return
		}
		if project.Status != "suspended" && project.Status != "resume_failed" {
			c.JSON(http.StatusConflict, gin.H{"error": "project cannot be resumed from its current state"})
			return
		}
	}

	resourceName := projectResourceName(project)
	replicas := int32(0)
	if action == "resume" {
		replicas = 1
	}

	// Changing the project's status and queuing the scale job commit together.
	tx, err := h.pool.Begin(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update project status"})
		return
	}
	defer func() { _ = tx.Rollback(c.Request.Context()) }()

	project, err = h.queries.WithTx(tx).UpdateProjectLifecycleStatus(c.Request.Context(), dbpkg.UpdateProjectLifecycleStatusParams{
		ID:     id,
		UserID: userID,
		Status: nextStatus,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update project status"})
		return
	}
	if _, err := h.jobs.InsertTx(c.Request.Context(), tx, jobs.ScaleArgs{
		ProjectID: project.ID,
		Subdomain: resourceName,
		Replicas:  replicas,
	}, nil); err != nil {
		slog.ErrorContext(c.Request.Context(), "failed to queue service operation", "project_id", id, "error", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "failed to queue service operation"})
		return
	}
	if err := tx.Commit(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update project status"})
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
		HealthCheck:    project.HealthCheck,
		Status:         project.Status,
		CreatedAt:      project.CreatedAt.Format(time.RFC3339),
	}
	response.Subdomain = project.Subdomain
	if project.DeleteRequestedAt != nil {
		value := project.DeleteRequestedAt.Format(time.RFC3339)
		response.DeleteRequestedAt = &value
	}
	response.DeleteError = project.DeleteError
	return response
}

func projectResourceName(project dbpkg.Project) string {
	resourceName := project.ID.String()[:8]
	if project.Subdomain != nil && *project.Subdomain != "" {
		resourceName = *project.Subdomain
	}
	return resourceName
}

type githubContentMetadata struct {
	Type string `json:"type"`
}

func validateGitHubDeployInputs(ctx context.Context, apiBase, repoURL, branch, dockerfilePath, token string) error {
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

	branchURL := fmt.Sprintf("%s/repos/%s/%s/branches/%s", apiBase, owner, repo, url.PathEscape(branch))
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
		"%s/repos/%s/%s/contents/%s?ref=%s",
		apiBase,
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
		return fmt.Errorf("no Dockerfile found at %q on branch %q", dockerfilePath, branch)
	}
	if dockerfileStatus < 200 || dockerfileStatus >= 300 {
		return fmt.Errorf("github Dockerfile check failed with status %d: %s", dockerfileStatus, dockerfileBody)
	}

	var content githubContentMetadata
	if err := json.Unmarshal([]byte(dockerfileBody), &content); err == nil && content.Type != "" && content.Type != "file" {
		return fmt.Errorf("the Dockerfile path %q is not a file", dockerfilePath)
	}
	return nil
}

// accessTokenFromContext returns the signed-in user's GitHub token, renewing
// it if it has expired. It reports false when there is none to give, in which
// case the user has to sign in again.
func accessTokenFromContext(c *gin.Context) (string, bool) {
	token, err := auth.GitHubToken(c)
	if err != nil {
		if !errors.Is(err, auth.ErrReauthRequired) {
			slog.ErrorContext(c.Request.Context(), "failed to get the user's GitHub token", "error", err)
		}
		return "", false
	}
	return token, token != ""
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
	setGitHubHeaders(req, token)

	resp, err := outboundHTTPClient.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
	return resp.StatusCode, strings.TrimSpace(string(body)), nil
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
	if strings.HasPrefix(trimmed, "git@github.com:") {
		trimmed = strings.TrimPrefix(trimmed, "git@github.com:")
	} else if strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
		parsed, err := url.Parse(trimmed)
		if err != nil || !strings.EqualFold(parsed.Hostname(), "github.com") || parsed.User != nil {
			return "", fmt.Errorf("invalid github url")
		}
		if parsed.RawQuery != "" || parsed.Fragment != "" {
			return "", fmt.Errorf("invalid github url")
		}
		trimmed = parsed.EscapedPath()
		unescaped, err := url.PathUnescape(trimmed)
		if err != nil {
			return "", fmt.Errorf("invalid github url")
		}
		trimmed = unescaped
	}
	trimmed = strings.TrimSuffix(trimmed, ".git")
	trimmed = strings.Trim(trimmed, "/")

	parts := strings.Split(trimmed, "/")
	if len(parts) != 2 || !githubOwnerPattern.MatchString(parts[0]) || !githubRepoPattern.MatchString(parts[1]) {
		return "", fmt.Errorf("invalid github url")
	}

	return fmt.Sprintf("https://github.com/%s/%s", parts[0], parts[1]), nil
}

var subdomainPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)
var envVarKeyPattern = regexp.MustCompile(`^[A-Z_][A-Z0-9_]*$`)
var githubOwnerPattern = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$`)
var githubRepoPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{1,100}$`)

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
			SecretArn: nil,
		}); err != nil {
			return err
		}
	}
	return nil
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

func (h *ProjectHandler) recordActivity(c *gin.Context, userID uuid.UUID, logType, message string) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(c.Request.Context()), 2*time.Second)
	go func() {
		defer cancel()
		_, _ = h.queries.CreateActivityLog(ctx, dbpkg.CreateActivityLogParams{
			UserID:  userID,
			Type:    logType,
			Message: message,
		})
	}()
}
