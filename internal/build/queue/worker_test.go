package queue

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/YHQZ1/hatch/internal/githubapp"
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

// fakeTokens records which repository a token was requested for.
type fakeTokens struct {
	token       string
	err         error
	owner, name string
}

func (f *fakeTokens) InstallationToken(_ context.Context, owner, name string) (string, error) {
	f.owner, f.name = owner, name
	return f.token, f.err
}

func TestCloneTokenIsScopedToTheJobsRepository(t *testing.T) {
	tokens := &fakeTokens{token: " ghs_abc \n"}
	w := &Worker{cloneTokens: tokens}

	got, err := w.cloneToken(context.Background(), BuildJobEvent{RepoURL: "https://github.com/octocat/hello-world.git"})

	if err != nil || got != "ghs_abc" {
		t.Fatalf("cloneToken = %q, %v", got, err)
	}
	if tokens.owner != "octocat" || tokens.name != "hello-world" {
		t.Errorf("token requested for %s/%s", tokens.owner, tokens.name)
	}
}

func TestCloneTokenExplainsWhenTheAppIsNotInstalled(t *testing.T) {
	w := &Worker{cloneTokens: &fakeTokens{err: githubapp.ErrNotInstalled}}

	_, err := w.cloneToken(context.Background(), BuildJobEvent{RepoURL: "https://github.com/octocat/hello-world"})

	if err == nil || !strings.Contains(err.Error(), "not installed on octocat/hello-world") {
		t.Fatalf("err = %v, want the user told to install the App", err)
	}
}

func TestCloneTokenFailures(t *testing.T) {
	boom := errors.New("github is down")
	tests := map[string]struct {
		repoURL string
		tokens  *fakeTokens
	}{
		"not a GitHub URL": {"https://example.com/octocat/hello", &fakeTokens{token: "x"}},
		"GitHub failure":   {"https://github.com/octocat/hello", &fakeTokens{err: boom}},
	}
	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			w := &Worker{cloneTokens: tt.tokens}

			token, err := w.cloneToken(context.Background(), BuildJobEvent{RepoURL: tt.repoURL})

			if err == nil || token != "" {
				t.Fatalf("token = %q, err = %v; want an error and no token", token, err)
			}
		})
	}
}
