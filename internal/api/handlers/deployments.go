package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/YHQZ1/hatch/internal/jobs"
	"github.com/YHQZ1/hatch/internal/secrets"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type DeploymentResponse struct {
	ID          string  `json:"id"`
	ProjectID   string  `json:"project_id"`
	Branch      string  `json:"branch"`
	Status      string  `json:"status"`
	CPU         int32   `json:"cpu"`
	MemoryMB    int32   `json:"memory_mb"`
	Port        int32   `json:"port"`
	HealthCheck string  `json:"health_check"`
	ImageURI    *string `json:"image_uri"`
	EcsTaskArn  *string `json:"ecs_task_arn"`
	EcsService  *string `json:"ecs_service_name"`
	TargetGroup *string `json:"target_group_arn"`
	Subdomain   *string `json:"subdomain"`
	URL         *string `json:"url"`
	CommitSHA   *string `json:"commit_sha"`
	CommitMsg   *string `json:"commit_message"`
	ErrorStage  *string `json:"error_stage"`
	ErrorMsg    *string `json:"error_message"`
	CreatedAt   string  `json:"created_at"`
	DeployedAt  *string `json:"deployed_at"`
	FailedAt    *string `json:"failed_at"`
}

func (h *DeploymentHandler) toDeploymentResponse(d dbpkg.Deployment) DeploymentResponse {
	r := DeploymentResponse{
		ID:          d.ID.String(),
		ProjectID:   d.ProjectID.String(),
		Branch:      d.Branch,
		Status:      d.Status,
		CPU:         d.Cpu,
		MemoryMB:    d.MemoryMb,
		Port:        d.Port,
		HealthCheck: d.HealthCheck,
		CreatedAt:   d.CreatedAt.Format(time.RFC3339),
	}
	r.ImageURI = d.ImageUri
	r.EcsTaskArn = d.EcsTaskArn
	r.EcsService = d.EcsServiceName
	r.TargetGroup = d.TargetGroupArn
	r.Subdomain = d.Subdomain
	r.URL = d.Url
	r.CommitSHA = d.CommitSha
	r.CommitMsg = d.CommitMessage
	r.ErrorStage = d.ErrorStage
	r.ErrorMsg = d.ErrorMessage
	if d.DeployedAt != nil {
		s := d.DeployedAt.Format(time.RFC3339)
		r.DeployedAt = &s
	}
	if d.FailedAt != nil {
		s := d.FailedAt.Format(time.RFC3339)
		r.FailedAt = &s
	}
	return r
}

type DeploymentHandler struct {
	queries *dbpkg.Queries
	jobs    jobs.Inserter
	pool    *pgxpool.Pool
	rdb     *redis.Client
	secrets *secrets.Codec
}

const (
	defaultDeploymentCPU      int32 = 512
	defaultDeploymentMemoryMB int32 = 1024
	maxDeploymentLogLines           = 5000
)

func NewDeploymentHandler(pool *pgxpool.Pool, inserter jobs.Inserter, rdb *redis.Client, secretCodec *secrets.Codec) *DeploymentHandler {
	return &DeploymentHandler{
		queries: dbpkg.New(pool),
		jobs:    inserter,
		pool:    pool,
		rdb:     rdb,
		secrets: secretCodec,
	}
}

func (h *DeploymentHandler) CreateDeployment(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var body struct {
		ProjectID   string            `json:"project_id" binding:"required"`
		Branch      string            `json:"branch"`
		Port        int32             `json:"port"`
		HealthCheck string            `json:"health_check"`
		EnvVars     map[string]string `json:"env_vars"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	projectID, err := uuid.Parse(body.ProjectID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project_id"})
		return
	}

	project, err := h.queries.GetProjectByIDAndUserID(c.Request.Context(), dbpkg.GetProjectByIDAndUserIDParams{
		ID:     projectID,
		UserID: userID,
	})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	if project.Status != "" && project.Status != "active" {
		c.JSON(http.StatusConflict, gin.H{"error": "project is not active"})
		return
	}
	port := body.Port
	if port == 0 {
		port = project.Port
	}
	if port < 1 || port > 65535 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "port must be between 1 and 65535"})
		return
	}

	if activeDeployment, ok := h.activeDeploymentForProject(c.Request.Context(), projectID, userID); ok {
		c.JSON(http.StatusConflict, gin.H{
			"error":      "deployment already running",
			"deployment": h.toDeploymentResponse(activeDeployment),
		})
		return
	}

	userToken, ok := accessTokenFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required: sign in again"})
		return
	}

	branch := strings.TrimSpace(body.Branch)
	if branch == "" {
		branch = project.Branch
	}

	healthCheck, err := normalizeHealthCheckPath(body.HealthCheck)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cpu := defaultDeploymentCPU
	memoryMB := defaultDeploymentMemoryMB

	effectiveSubdomain := projectID.String()[:8]
	if project.Subdomain != nil && *project.Subdomain != "" {
		effectiveSubdomain = *project.Subdomain
	}

	commitSHA, commitMessage := fetchGitHubBranchHead(
		c.Request.Context(),
		project.RepoUrl,
		branch,
		userToken,
	)

	tx, err := h.pool.Begin(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start deployment transaction"})
		return
	}
	defer func() { _ = tx.Rollback(c.Request.Context()) }()

	qtx := h.queries.WithTx(tx)
	deployment, err := qtx.CreateDeployment(c.Request.Context(), dbpkg.CreateDeploymentParams{
		ProjectID:     projectID,
		Branch:        branch,
		Cpu:           cpu,
		MemoryMb:      memoryMB,
		Port:          port,
		HealthCheck:   healthCheck,
		Subdomain:     &effectiveSubdomain,
		CommitSha:     nullString(commitSHA),
		CommitMessage: nullString(commitMessage),
	})
	if err != nil {
		if isActiveDeploymentConflict(err) {
			if activeDeployment, ok := h.activeDeploymentForProject(c.Request.Context(), projectID, userID); ok {
				c.JSON(http.StatusConflict, gin.H{
					"error":      "deployment already running",
					"deployment": h.toDeploymentResponse(activeDeployment),
				})
				return
			}
			c.JSON(http.StatusConflict, gin.H{"error": "deployment already running"})
			return
		}
		slog.ErrorContext(c.Request.Context(), "failed to create deployment", "project_id", projectID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create deployment"})
		return
	}

	envSnapshot, err := h.buildDeploymentEnvSnapshot(c.Request.Context(), qtx, projectID, body.EnvVars)
	if err != nil {
		if isValidationError(err) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load environment variables"})
		return
	}

	for key, value := range envSnapshot {
		if key != "" {
			storedValue, err := h.secrets.Encrypt(value)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to secure environment variables"})
				return
			}
			_, err = qtx.CreateEnvVar(c.Request.Context(), dbpkg.CreateEnvVarParams{
				DeploymentID: deployment.ID,
				Key:          key,
				Value:        storedValue,
				SecretArn:    nil,
			})
			if err != nil {
				slog.ErrorContext(c.Request.Context(), "failed to snapshot an environment variable", "deployment_id", deployment.ID, "error", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save environment variables"})
				return
			}
		}
	}

	// The build job joins the deployment's transaction: either both exist or
	// neither does.
	if _, err := h.jobs.InsertTx(c.Request.Context(), tx, jobs.BuildArgs{
		DeploymentID:   deployment.ID,
		RepoURL:        project.RepoUrl,
		Branch:         branch,
		DockerfilePath: project.DockerfilePath,
		Port:           port,
		Subdomain:      effectiveSubdomain,
		CPU:            cpu,
		MemoryMB:       memoryMB,
		HealthCheck:    healthCheck,
	}, nil); err != nil {
		slog.ErrorContext(c.Request.Context(), "failed to queue deployment", "deployment_id", deployment.ID, "error", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "failed to queue deployment"})
		return
	}

	if err := tx.Commit(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit deployment"})
		return
	}

	c.JSON(http.StatusCreated, h.toDeploymentResponse(deployment))
}

func (h *DeploymentHandler) GetDeployment(c *gin.Context) {
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

	deployment, err := h.queries.GetDeploymentByIDAndUserID(c.Request.Context(), dbpkg.GetDeploymentByIDAndUserIDParams{
		ID:     id,
		UserID: userID,
	})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "deployment not found"})
		return
	}

	c.JSON(http.StatusOK, h.toDeploymentResponse(deployment))
}

func (h *DeploymentHandler) CancelDeployment(c *gin.Context) {
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

	deployment, err := h.queries.CancelDeploymentByIDAndUserID(c.Request.Context(), dbpkg.CancelDeploymentByIDAndUserIDParams{
		ID:     id,
		UserID: userID,
	})
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "deployment cannot be canceled"})
		return
	}

	key := fmt.Sprintf("logs:%s", id.String())
	msg := "Deployment canceled by user"
	pipe := h.rdb.Pipeline()
	pipe.RPush(c.Request.Context(), key, msg)
	pipe.Expire(c.Request.Context(), key, 7*24*time.Hour)
	if _, err := pipe.Exec(c.Request.Context()); err != nil {
		slog.WarnContext(c.Request.Context(), "failed to persist the cancel log line", "deployment_id", id, "error", err)
	}
	if err := h.rdb.Publish(c.Request.Context(), fmt.Sprintf("deployment:%s", id.String()), msg).Err(); err != nil {
		slog.WarnContext(c.Request.Context(), "failed to publish the cancel log line", "deployment_id", id, "error", err)
	}

	c.JSON(http.StatusOK, h.toDeploymentResponse(deployment))
}

func (h *DeploymentHandler) ListDeployments(c *gin.Context) {
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

	deployments, err := h.queries.GetDeploymentsByProjectIDAndUserID(c.Request.Context(), dbpkg.GetDeploymentsByProjectIDAndUserIDParams{
		ProjectID: id,
		UserID:    userID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch deployments"})
		return
	}

	responses := make([]DeploymentResponse, len(deployments))
	for i, d := range deployments {
		responses[i] = h.toDeploymentResponse(d)
	}

	c.JSON(http.StatusOK, responses)
}

func (h *DeploymentHandler) GetDeploymentLogs(c *gin.Context) {
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

	if _, err := h.queries.GetDeploymentByIDAndUserID(c.Request.Context(), dbpkg.GetDeploymentByIDAndUserIDParams{
		ID:     id,
		UserID: userID,
	}); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "deployment not found"})
		return
	}

	key := fmt.Sprintf("logs:%s", id.String())
	logs, err := h.rdb.LRange(c.Request.Context(), key, -maxDeploymentLogLines, -1).Result()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch logs"})
		return
	}

	c.JSON(http.StatusOK, logs)
}

type githubBranchResponse struct {
	Commit struct {
		SHA    string `json:"sha"`
		Commit struct {
			Message string `json:"message"`
		} `json:"commit"`
	} `json:"commit"`
}

func fetchGitHubBranchHead(ctx context.Context, repoURL, branch, token string) (string, string) {
	owner, repo, err := parseRepoURL(repoURL)
	if err != nil || owner == "" || repo == "" || branch == "" || token == "" {
		return "", ""
	}

	endpoint := fmt.Sprintf("https://api.github.com/repos/%s/%s/branches/%s", owner, repo, url.PathEscape(branch))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", ""
	}
	setGitHubHeaders(req, token)

	resp, err := outboundHTTPClient.Do(req)
	if err != nil {
		return "", ""
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", ""
	}

	var payload githubBranchResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", ""
	}

	return payload.Commit.SHA, firstCommitLine(payload.Commit.Commit.Message)
}

// nullString is value, or nil when it is empty, for nullable text columns.
func nullString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func firstCommitLine(message string) string {
	for _, ch := range []string{"\r\n", "\n", "\r"} {
		if idx := strings.Index(message, ch); idx >= 0 {
			return message[:idx]
		}
	}
	return message
}

func normalizeHealthCheckPath(raw string) (string, error) {
	healthCheck := strings.TrimSpace(raw)
	if healthCheck == "" {
		return "/", nil
	}
	if !strings.HasPrefix(healthCheck, "/") || strings.ContainsAny(healthCheck, " \t\r\n") {
		return "", fmt.Errorf("health_check must be an absolute path without whitespace")
	}
	if len(healthCheck) > 1024 {
		return "", fmt.Errorf("health_check cannot exceed 1024 characters")
	}
	return healthCheck, nil
}

func (h *DeploymentHandler) buildDeploymentEnvSnapshot(ctx context.Context, q *dbpkg.Queries, projectID uuid.UUID, overrides map[string]string) (map[string]string, error) {
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

func (h *DeploymentHandler) activeDeploymentForProject(ctx context.Context, projectID, userID uuid.UUID) (dbpkg.Deployment, bool) {
	deployment, err := h.queries.GetActiveDeploymentByProjectIDAndUserID(ctx, dbpkg.GetActiveDeploymentByProjectIDAndUserIDParams{
		ProjectID: projectID,
		UserID:    userID,
	})
	if err != nil {
		return dbpkg.Deployment{}, false
	}
	return deployment, true
}

func isActiveDeploymentConflict(err error) bool {
	return strings.Contains(err.Error(), "idx_one_active_deployment_per_project")
}
