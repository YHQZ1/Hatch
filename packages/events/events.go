package events

type BuildJobEvent struct {
	DeploymentID   string `json:"deployment_id"`
	RepoURL        string `json:"repo_url"`
	Branch         string `json:"branch"`
	DockerfilePath string `json:"dockerfile_path"`
	UserToken      string `json:"user_token"`
	Port           int    `json:"port"`
}

type BuildCompleteEvent struct {
	DeploymentID string `json:"deployment_id"`
	ImageURI     string `json:"image_uri"`
	Success      bool   `json:"success"`
	Error        string `json:"error,omitempty"`
}

type DeployJobEvent struct {
	DeploymentID    string            `json:"deployment_id"`
	ImageURI        string            `json:"image_uri"`
	CPU             int               `json:"cpu"`
	MemoryMB        int               `json:"memory_mb"`
	Port            int               `json:"port"`
	HealthCheckPath string            `json:"health_check_path"`
	EnvVars         map[string]string `json:"env_vars"`
	Subdomain       string            `json:"subdomain"`
}
