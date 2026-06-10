package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/YHQZ1/hatch/apps/api/internal/queue"
	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
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
	if d.ImageUri.Valid {
		r.ImageURI = &d.ImageUri.String
	}
	if d.EcsTaskArn.Valid {
		r.EcsTaskArn = &d.EcsTaskArn.String
	}
	if d.EcsServiceName.Valid {
		r.EcsService = &d.EcsServiceName.String
	}
	if d.TargetGroupArn.Valid {
		r.TargetGroup = &d.TargetGroupArn.String
	}
	if d.Subdomain.Valid {
		r.Subdomain = &d.Subdomain.String
	}
	if d.Url.Valid {
		r.URL = &d.Url.String
	}
	if d.CommitSha.Valid {
		r.CommitSHA = &d.CommitSha.String
	}
	if d.CommitMessage.Valid {
		r.CommitMsg = &d.CommitMessage.String
	}
	if d.ErrorStage.Valid {
		r.ErrorStage = &d.ErrorStage.String
	}
	if d.ErrorMessage.Valid {
		r.ErrorMsg = &d.ErrorMessage.String
	}
	if d.DeployedAt.Valid {
		s := d.DeployedAt.Time.Format(time.RFC3339)
		r.DeployedAt = &s
	}
	if d.FailedAt.Valid {
		s := d.FailedAt.Time.Format(time.RFC3339)
		r.FailedAt = &s
	}
	return r
}

type DeploymentHandler struct {
	queries   *dbpkg.Queries
	publisher *queue.Publisher
	db        *sql.DB
	rdb       *redis.Client
}

const (
	defaultDeploymentCPU      int32 = 512
	defaultDeploymentMemoryMB int32 = 1024
)

func NewDeploymentHandler(db *sql.DB, publisher *queue.Publisher, rdb *redis.Client) *DeploymentHandler {
	return &DeploymentHandler{
		queries:   dbpkg.New(db),
		publisher: publisher,
		db:        db,
		rdb:       rdb,
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
		CPU         int32             `json:"cpu"`
		MemoryMB    int32             `json:"memory_mb"`
		Port        int32             `json:"port" binding:"required"`
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
	if project.Status == "suspended" || project.Status == "suspending" || project.Status == "deleting" {
		c.JSON(http.StatusConflict, gin.H{"error": "project is not active"})
		return
	}
	if body.Port < 1 || body.Port > 65535 {
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

	branch := strings.TrimSpace(body.Branch)
	if branch == "" {
		branch = project.Branch
	}

	healthCheck, err := normalizeHealthCheckPath(body.HealthCheck)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cpu := body.CPU
	if cpu <= 0 {
		cpu = defaultDeploymentCPU
	}
	memoryMB := body.MemoryMB
	if memoryMB <= 0 {
		memoryMB = defaultDeploymentMemoryMB
	}

	effectiveSubdomain := projectID.String()[:8]
	if project.Subdomain.Valid && project.Subdomain.String != "" {
		effectiveSubdomain = project.Subdomain.String
	}

	commitSHA, commitMessage := fetchGitHubBranchHead(
		c.Request.Context(),
		project.RepoUrl,
		branch,
		userToken,
	)

	tx, err := h.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start deployment transaction"})
		return
	}
	defer tx.Rollback()

	qtx := h.queries.WithTx(tx)
	deployment, err := qtx.CreateDeployment(c.Request.Context(), dbpkg.CreateDeploymentParams{
		ProjectID:     projectID,
		Branch:        branch,
		Cpu:           cpu,
		MemoryMb:      memoryMB,
		Port:          body.Port,
		HealthCheck:   healthCheck,
		Subdomain:     sql.NullString{String: effectiveSubdomain, Valid: true},
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
		fmt.Printf("DATABASE ERROR: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create deployment"})
		return
	}

	envSnapshot, err := buildDeploymentEnvSnapshot(c.Request.Context(), qtx, projectID, body.EnvVars)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load environment variables"})
		return
	}

	for key, value := range envSnapshot {
		if key != "" {
			_, err = qtx.CreateEnvVar(c.Request.Context(), dbpkg.CreateEnvVarParams{
				DeploymentID: deployment.ID,
				Key:          key,
				Value:        value,
				SecretArn:    sql.NullString{},
			})
			if err != nil {
				fmt.Printf("SQL Error inserting env_var: %v\n", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save environment variables"})
				return
			}
		}
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit deployment"})
		return
	}

	if err := h.publisher.PublishBuildJob(c.Request.Context(), queue.BuildJobEvent{
		DeploymentID:   deployment.ID.String(),
		RepoURL:        project.RepoUrl,
		Branch:         branch,
		DockerfilePath: project.DockerfilePath,
		UserToken:      userToken,
		Port:           int(body.Port),
		Subdomain:      effectiveSubdomain,
		CPU:            cpu,
		MemoryMB:       memoryMB,
		HealthCheck:    healthCheck,
	}); err != nil {
		_, _ = h.queries.MarkDeploymentFailed(c.Request.Context(), dbpkg.MarkDeploymentFailedParams{
			ID:           deployment.ID,
			ErrorStage:   sql.NullString{String: "queue", Valid: true},
			ErrorMessage: sql.NullString{String: "failed to queue deployment", Valid: true},
		})
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "failed to queue deployment"})
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
	h.rdb.RPush(c.Request.Context(), key, msg)
	h.rdb.Publish(c.Request.Context(), fmt.Sprintf("deployment:%s", id.String()), msg)

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
	logs, err := h.rdb.LRange(c.Request.Context(), key, 0, -1).Result()
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

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/branches/%s", owner, repo, branch)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", ""
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
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

func nullString(value string) sql.NullString {
	return sql.NullString{String: value, Valid: value != ""}
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
	return healthCheck, nil
}

func buildDeploymentEnvSnapshot(ctx context.Context, q *dbpkg.Queries, projectID uuid.UUID, overrides map[string]string) (map[string]string, error) {
	projectEnvVars, err := q.GetProjectEnvVarsByProject(ctx, projectID)
	if err != nil {
		return nil, err
	}

	envSnapshot := make(map[string]string)
	for _, envVar := range projectEnvVars {
		envSnapshot[envVar.Key] = envVar.Value
	}
	for key, value := range normalizeEnvVars(overrides) {
		envSnapshot[key] = value
	}
	return envSnapshot, nil
}

func (h *DeploymentHandler) activeDeploymentForProject(ctx context.Context, projectID, userID uuid.UUID) (dbpkg.Deployment, bool) {
	deployments, err := h.queries.GetDeploymentsByProjectIDAndUserID(ctx, dbpkg.GetDeploymentsByProjectIDAndUserIDParams{
		ProjectID: projectID,
		UserID:    userID,
	})
	if err != nil {
		return dbpkg.Deployment{}, false
	}

	for _, deployment := range deployments {
		if deployment.Status == "queued" || deployment.Status == "building" || deployment.Status == "deploying" {
			return deployment, true
		}
	}

	return dbpkg.Deployment{}, false
}

func isActiveDeploymentConflict(err error) bool {
	return strings.Contains(err.Error(), "idx_one_active_deployment_per_project")
}
