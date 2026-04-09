package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
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
	Subdomain   *string `json:"subdomain"`
	URL         *string `json:"url"`
	CreatedAt   string  `json:"created_at"`
	DeployedAt  *string `json:"deployed_at"`
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
	if d.Subdomain.Valid {
		r.Subdomain = &d.Subdomain.String
	}
	if d.Url.Valid {
		r.URL = &d.Url.String
	}
	if d.DeployedAt.Valid {
		s := d.DeployedAt.Time.Format(time.RFC3339)
		r.DeployedAt = &s
	}
	return r
}

type DeploymentHandler struct {
	queries   *dbpkg.Queries
	publisher *queue.Publisher
	db        *sql.DB
	rdb       *redis.Client
}

func NewDeploymentHandler(db *sql.DB, publisher *queue.Publisher, rdb *redis.Client) *DeploymentHandler {
	return &DeploymentHandler{
		queries:   dbpkg.New(db),
		publisher: publisher,
		db:        db,
		rdb:       rdb,
	}
}

func (h *DeploymentHandler) CreateDeployment(c *gin.Context) {
	var body struct {
		ProjectID   string            `json:"project_id" binding:"required"`
		Branch      string            `json:"branch" binding:"required"`
		CPU         int32             `json:"cpu" binding:"required"`
		MemoryMB    int32             `json:"memory_mb" binding:"required"`
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

	project, err := h.queries.GetProjectByID(c.Request.Context(), projectID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	healthCheck := "/"
	if body.HealthCheck != "" {
		healthCheck = body.HealthCheck
	}

	effectiveSubdomain := projectID.String()[:8]
	if project.Subdomain.Valid && project.Subdomain.String != "" {
		effectiveSubdomain = project.Subdomain.String
	}

	deployment, err := h.queries.CreateDeployment(c.Request.Context(), dbpkg.CreateDeploymentParams{
		ProjectID:   projectID,
		Branch:      body.Branch,
		Cpu:         body.CPU,
		MemoryMb:    body.MemoryMB,
		Port:        body.Port,
		HealthCheck: healthCheck,
		Subdomain:   sql.NullString{String: effectiveSubdomain, Valid: true},
	})
	if err != nil {
		fmt.Printf("DATABASE ERROR: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for key, value := range body.EnvVars {
		if key != "" {
			_, err = h.db.ExecContext(c.Request.Context(),
				"INSERT INTO env_vars (deployment_id, key, value) VALUES ($1, $2, $3)",
				deployment.ID, key, value,
			)
			if err != nil {
				fmt.Printf("SQL Error inserting env_var: %v\n", err)
				continue
			}
		}
	}

	tokenRaw, _ := c.Get("access_token")
	userToken := fmt.Sprintf("%v", tokenRaw)
	if userToken == "" || userToken == "<nil>" || tokenRaw == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required: missing access token"})
		return
	}

	h.publisher.PublishBuildJob(c.Request.Context(), queue.BuildJobEvent{
		DeploymentID:   deployment.ID.String(),
		RepoURL:        project.RepoUrl,
		Branch:         body.Branch,
		DockerfilePath: project.DockerfilePath,
		UserToken:      userToken,
		Port:           int(body.Port),
		Subdomain:      effectiveSubdomain,
		CPU:            body.CPU,
		MemoryMB:       body.MemoryMB,
		HealthCheck:    healthCheck,
	})

	c.JSON(http.StatusCreated, h.toDeploymentResponse(deployment))
}

func (h *DeploymentHandler) GetDeployment(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	deployment, err := h.queries.GetDeploymentByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "deployment not found"})
		return
	}

	c.JSON(http.StatusOK, h.toDeploymentResponse(deployment))
}

func (h *DeploymentHandler) ListDeployments(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	deployments, err := h.queries.GetDeploymentsByProjectID(c.Request.Context(), id)
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
	key := fmt.Sprintf("logs:%s", c.Param("id"))
	logs, err := h.rdb.LRange(c.Request.Context(), key, 0, -1).Result()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch logs"})
		return
	}

	c.JSON(http.StatusOK, logs)
}
