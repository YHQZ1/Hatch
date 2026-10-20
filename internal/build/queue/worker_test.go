package queue

import (
	"strings"
	"testing"
)

func TestValidateBuildJobAcceptsValidJob(t *testing.T) {
	job := BuildJobEvent{
		DeploymentID:   "deployment-123",
		RepoURL:        "https://github.com/octocat/hello-world",
		DockerfilePath: "Dockerfile",
		Port:           3000,
		CPU:            256,
		MemoryMB:       512,
	}

	if err := validateBuildJob(job); err != nil {
		t.Fatalf("validateBuildJob() error = %v", err)
	}
}

func TestValidateBuildJobRejectsInvalidJobs(t *testing.T) {
	valid := BuildJobEvent{
		DeploymentID: "deployment-123",
		RepoURL:      "https://github.com/octocat/hello-world",
		Port:         3000,
		CPU:          256,
		MemoryMB:     512,
	}

	tests := map[string]BuildJobEvent{
		"missing deployment": {RepoURL: valid.RepoURL, Port: valid.Port, CPU: valid.CPU, MemoryMB: valid.MemoryMB},
		"missing repo":       {DeploymentID: valid.DeploymentID, Port: valid.Port, CPU: valid.CPU, MemoryMB: valid.MemoryMB},
		"bad port":           {DeploymentID: valid.DeploymentID, RepoURL: valid.RepoURL, Port: 0, CPU: valid.CPU, MemoryMB: valid.MemoryMB},
		"bad cpu":            {DeploymentID: valid.DeploymentID, RepoURL: valid.RepoURL, Port: valid.Port, CPU: 0, MemoryMB: valid.MemoryMB},
		"bad memory":         {DeploymentID: valid.DeploymentID, RepoURL: valid.RepoURL, Port: valid.Port, CPU: valid.CPU, MemoryMB: 0},
		"long dockerfile":    {DeploymentID: valid.DeploymentID, RepoURL: valid.RepoURL, Port: valid.Port, CPU: valid.CPU, MemoryMB: valid.MemoryMB, DockerfilePath: strings.Repeat("a", 513)},
		"nul dockerfile":     {DeploymentID: valid.DeploymentID, RepoURL: valid.RepoURL, Port: valid.Port, CPU: valid.CPU, MemoryMB: valid.MemoryMB, DockerfilePath: "Dockerfile\x00"},
	}

	for name, job := range tests {
		t.Run(name, func(t *testing.T) {
			if err := validateBuildJob(job); err == nil {
				t.Fatal("validateBuildJob() succeeded, want error")
			}
		})
	}
}

func TestSafePathSegment(t *testing.T) {
	got := safePathSegment("../deploy/id:123")
	if got != "deploy-id-123" {
		t.Fatalf("safePathSegment() = %q", got)
	}
}
