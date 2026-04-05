package handlers

import (
	"database/sql"
	"log"
	"net/http"

	"github.com/YHQZ1/hatch/apps/api/internal/queue"
	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
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

func toDeploymentResponse(d dbpkg.Deployment) DeploymentResponse {
	r := DeploymentResponse{
		ID:          d.ID.String(),
		ProjectID:   d.ProjectID.String(),
		Branch:      d.Branch,
		Status:      d.Status,
		CPU:         d.Cpu,
		MemoryMB:    d.MemoryMb,
		Port:        d.Port,
		HealthCheck: d.HealthCheck,
		CreatedAt:   d.CreatedAt.String(),
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
		s := d.DeployedAt.Time.String()
		r.DeployedAt = &s
	}
	return r
}

type DeploymentHandler struct {
	queries   *dbpkg.Queries
	publisher *queue.Publisher
	db        *sql.DB
}

func NewDeploymentHandler(db *sql.DB, publisher *queue.Publisher) *DeploymentHandler {
	return &DeploymentHandler{
		queries:   dbpkg.New(db),
		publisher: publisher,
		db:        db,
	}
}

func (h *DeploymentHandler) CreateDeployment(c *gin.Context) {
	var body struct {
		ProjectID       string            `json:"project_id"       binding:"required"`
		Branch          string            `json:"branch"           binding:"required"`
		CPU             int32             `json:"cpu"              binding:"required"`
		MemoryMB        int32             `json:"memory_mb"        binding:"required"`
		Port            int32             `json:"port"             binding:"required"`
		HealthCheckPath string            `json:"health_check_path"`
		EnvVars         map[string]string `json:"env_vars"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	projectID, err := uuid.Parse(body.ProjectID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project_id"})
		return
	}

	healthCheck := body.HealthCheckPath
	if healthCheck == "" {
		healthCheck = "/"
	}

	subdomain := uuid.New().String()[:8]

	deployment, err := h.queries.CreateDeployment(c.Request.Context(), dbpkg.CreateDeploymentParams{
		ProjectID:   projectID,
		Branch:      body.Branch,
		Cpu:         body.CPU,
		MemoryMb:    body.MemoryMB,
		Port:        body.Port,
		HealthCheck: healthCheck,
		Subdomain:   sql.NullString{String: subdomain, Valid: true},
	})
	if err != nil {
		log.Printf("failed to create deployment: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create deployment"})
		return
	}

	if len(body.EnvVars) > 0 {
		for key, value := range body.EnvVars {
			if key == "" {
				continue
			}
			_, err := h.db.ExecContext(c.Request.Context(),
				"INSERT INTO env_vars (deployment_id, key, secret_arn) VALUES ($1, $2, $3)",
				deployment.ID, key, value,
			)
			if err != nil {
				log.Printf("failed to store env var %s: %v", key, err)
			}
		}
	}

	response := toDeploymentResponse(deployment)
	c.JSON(http.StatusCreated, response)

	project, err := h.queries.GetProjectByID(c.Request.Context(), projectID)
	if err != nil {
		log.Printf("failed to fetch project for build job: %v", err)
		return
	}

	accessToken, _ := c.Get("access_token")
	tokenStr, _ := accessToken.(string)

	job := queue.BuildJobEvent{
		DeploymentID: deployment.ID.String(),
		RepoURL:      project.RepoUrl,
		Branch:       body.Branch,
		UserToken:    tokenStr,
		Port:         int(body.Port),
	}

	if err := h.publisher.PublishBuildJob(c.Request.Context(), job); err != nil {
		log.Printf("failed to publish build job: %v", err)
		return
	}

	log.Printf("build job queued for deployment %s", deployment.ID)
}

func (h *DeploymentHandler) GetDeployment(c *gin.Context) {
	deploymentID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid deployment id"})
		return
	}

	deployment, err := h.queries.GetDeploymentByID(c.Request.Context(), deploymentID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "deployment not found"})
		return
	}

	c.JSON(http.StatusOK, toDeploymentResponse(deployment))
}

func (h *DeploymentHandler) ListDeployments(c *gin.Context) {
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}

	deployments, err := h.queries.GetDeploymentsByProjectID(c.Request.Context(), projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch deployments"})
		return
	}

	responses := make([]DeploymentResponse, len(deployments))
	for i, d := range deployments {
		responses[i] = toDeploymentResponse(d)
	}
	c.JSON(http.StatusOK, responses)
}
