// Package jobs defines Hatch's background jobs and runs them on River.
//
// Jobs live in Postgres and are enqueued in the same transaction as the change
// that causes them (ADR 0011). Each worker depends on the build.Builder and
// runtime.Runtime interfaces only.
package jobs

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/riverqueue/river"
)

// Queue names. Builds and deploys run one at a time, as they did before jobs
// moved into Postgres.
const (
	queueBuild   = "build"
	queueDeploy  = "deploy"
	queueControl = "control"
)

// maxAttempts is 2 for every job: a job that fails does so for good (the
// worker records the reason and cancels it), so the second attempt exists only
// to resume a job whose process died or was stopped part-way.
const maxAttempts = 2

// BuildArgs asks for a build of one deployment. On success the build job
// enqueues the deploy job.
type BuildArgs struct {
	DeploymentID   uuid.UUID `json:"deployment_id"`
	RepoURL        string    `json:"repo_url"`
	Branch         string    `json:"branch"`
	DockerfilePath string    `json:"dockerfile_path"`
	Subdomain      string    `json:"subdomain"`
	Port           int32     `json:"port"`
	CPU            int32     `json:"cpu"`
	MemoryMB       int32     `json:"memory_mb"`
	HealthCheck    string    `json:"health_check"`
}

func (BuildArgs) Kind() string { return "build" }

func (BuildArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: queueBuild, MaxAttempts: maxAttempts}
}

func (a BuildArgs) Validate() error {
	if a.DeploymentID == uuid.Nil {
		return fmt.Errorf("deployment_id is required")
	}
	if strings.TrimSpace(a.RepoURL) == "" {
		return fmt.Errorf("repo_url is required")
	}
	if a.Port <= 0 || a.Port > 65535 {
		return fmt.Errorf("port must be between 1 and 65535")
	}
	if a.CPU <= 0 {
		return fmt.Errorf("cpu must be greater than zero")
	}
	if a.MemoryMB <= 0 {
		return fmt.Errorf("memory_mb must be greater than zero")
	}
	if len(a.DockerfilePath) > 512 {
		return fmt.Errorf("dockerfile_path is too long")
	}
	if strings.Contains(a.DockerfilePath, "\x00") {
		return fmt.Errorf("dockerfile_path contains invalid characters")
	}
	return nil
}

// DeployArgs asks for a built image to be run.
type DeployArgs struct {
	DeploymentID uuid.UUID `json:"deployment_id"`
	ImageURI     string    `json:"image_uri"`
	Subdomain    string    `json:"subdomain"`
	Port         int32     `json:"port"`
	CPU          int32     `json:"cpu"`
	MemoryMB     int32     `json:"memory_mb"`
	HealthCheck  string    `json:"health_check"`
	// RollbackOf is the deployment whose release this one runs again. Such a
	// deployment shares that release's image instead of owning one, so nothing
	// here may delete it.
	RollbackOf *uuid.UUID `json:"rollback_of,omitempty"`
}

func (DeployArgs) Kind() string { return "deploy" }

// OwnsImage reports whether the image was built for this deployment, and so
// goes when the deployment does.
func (a DeployArgs) OwnsImage() bool { return a.RollbackOf == nil }

func (DeployArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: queueDeploy, MaxAttempts: maxAttempts}
}

func (a DeployArgs) Validate() error {
	if a.DeploymentID == uuid.Nil {
		return fmt.Errorf("deployment_id is required")
	}
	if strings.TrimSpace(a.ImageURI) == "" {
		return fmt.Errorf("image_uri is required")
	}
	if strings.TrimSpace(a.Subdomain) == "" {
		return fmt.Errorf("subdomain is required")
	}
	if a.Port <= 0 || a.Port > 65535 {
		return fmt.Errorf("port must be between 1 and 65535")
	}
	if a.CPU <= 0 {
		return fmt.Errorf("cpu must be greater than zero")
	}
	if a.MemoryMB <= 0 {
		return fmt.Errorf("memory_mb must be greater than zero")
	}
	if len(a.HealthCheck) > 1024 {
		return fmt.Errorf("health_check is too long")
	}
	if strings.Contains(a.HealthCheck, "\x00") {
		return fmt.Errorf("health_check contains invalid characters")
	}
	return nil
}

// DestroyAppArgs asks for everything behind a project to be removed, then the
// project itself.
type DestroyAppArgs struct {
	ProjectID uuid.UUID `json:"project_id"`
	Subdomain string    `json:"subdomain"`
}

func (DestroyAppArgs) Kind() string { return "destroy_app" }

func (DestroyAppArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: queueControl, MaxAttempts: maxAttempts}
}

func (a DestroyAppArgs) Validate() error {
	if a.ProjectID == uuid.Nil {
		return fmt.Errorf("project_id is required")
	}
	if strings.TrimSpace(a.Subdomain) == "" {
		return fmt.Errorf("subdomain is required")
	}
	return nil
}

// ScaleArgs asks for a project to run the given number of copies: 0 pauses it,
// 1 resumes it.
type ScaleArgs struct {
	ProjectID uuid.UUID `json:"project_id"`
	Subdomain string    `json:"subdomain"`
	Replicas  int32     `json:"replicas"`
}

func (ScaleArgs) Kind() string { return "scale" }

func (ScaleArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: queueControl, MaxAttempts: maxAttempts}
}

func (a ScaleArgs) Validate() error {
	if a.ProjectID == uuid.Nil {
		return fmt.Errorf("project_id is required")
	}
	if strings.TrimSpace(a.Subdomain) == "" {
		return fmt.Errorf("subdomain is required")
	}
	if a.Replicas != 0 && a.Replicas != 1 {
		return fmt.Errorf("replicas must be 0 (pause) or 1 (resume)")
	}
	return nil
}
