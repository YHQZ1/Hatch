package ecs

import (
	"strings"
	"testing"
)

func TestTargetGroupNameMatchesSlug(t *testing.T) {
	tests := []struct {
		name   string
		prefix string
		want   bool
	}{
		{name: "h-foo-80", prefix: "h-foo", want: true},
		{name: "h-foo-8080-a1b2c3d4", prefix: "h-foo", want: true},
		{name: "h-foo-bar-80", prefix: "h-foo", want: false},
		{name: "h-foo", prefix: "h-foo", want: false},
		{name: "h-foo-", prefix: "h-foo", want: false},
	}

	for _, tt := range tests {
		if got := targetGroupNameMatchesSlug(tt.name, tt.prefix); got != tt.want {
			t.Fatalf("targetGroupNameMatchesSlug(%q, %q) = %v, want %v", tt.name, tt.prefix, got, tt.want)
		}
	}
}

func TestTaskDefinitionFamily(t *testing.T) {
	arn := "arn:aws:ecs:ap-south-1:123456789012:task-definition/hatch-foo:42"
	if got := taskDefinitionFamily(arn); got != "hatch-foo" {
		t.Fatalf("taskDefinitionFamily() = %q, want hatch-foo", got)
	}
}

func TestNormalizeDeployInput(t *testing.T) {
	input := DeployInput{
		DeploymentID: " dep-1 ",
		ImageURI:     " repo/image:tag ",
		Port:         3000,
		CPU:          256,
		MemoryMB:     512,
		Subdomain:    "my-app",
		EnvVars:      map[string]string{"NODE_ENV": "production"},
	}

	got, err := normalizeDeployInput(input)
	if err != nil {
		t.Fatalf("normalizeDeployInput() error = %v", err)
	}
	if got.DeploymentID != "dep-1" || got.ImageURI != "repo/image:tag" || got.HealthCheck != "/" {
		t.Fatalf("normalizeDeployInput() = %+v", got)
	}
}

func TestNormalizeDeployInputRejectsInvalidValues(t *testing.T) {
	valid := DeployInput{
		DeploymentID: "dep-1",
		ImageURI:     "repo/image:tag",
		Port:         3000,
		CPU:          256,
		MemoryMB:     512,
		Subdomain:    "my-app",
		HealthCheck:  "/health",
	}

	tests := map[string]DeployInput{
		"missing deployment": {ImageURI: valid.ImageURI, Port: valid.Port, CPU: valid.CPU, MemoryMB: valid.MemoryMB, Subdomain: valid.Subdomain, HealthCheck: valid.HealthCheck},
		"missing image":      {DeploymentID: valid.DeploymentID, Port: valid.Port, CPU: valid.CPU, MemoryMB: valid.MemoryMB, Subdomain: valid.Subdomain, HealthCheck: valid.HealthCheck},
		"bad subdomain":      {DeploymentID: valid.DeploymentID, ImageURI: valid.ImageURI, Port: valid.Port, CPU: valid.CPU, MemoryMB: valid.MemoryMB, Subdomain: "-bad", HealthCheck: valid.HealthCheck},
		"bad port":           {DeploymentID: valid.DeploymentID, ImageURI: valid.ImageURI, Port: 0, CPU: valid.CPU, MemoryMB: valid.MemoryMB, Subdomain: valid.Subdomain, HealthCheck: valid.HealthCheck},
		"bad health path":    {DeploymentID: valid.DeploymentID, ImageURI: valid.ImageURI, Port: valid.Port, CPU: valid.CPU, MemoryMB: valid.MemoryMB, Subdomain: valid.Subdomain, HealthCheck: "health"},
		"long health path":   {DeploymentID: valid.DeploymentID, ImageURI: valid.ImageURI, Port: valid.Port, CPU: valid.CPU, MemoryMB: valid.MemoryMB, Subdomain: valid.Subdomain, HealthCheck: "/" + strings.Repeat("a", 1024)},
		"bad env name":       {DeploymentID: valid.DeploymentID, ImageURI: valid.ImageURI, Port: valid.Port, CPU: valid.CPU, MemoryMB: valid.MemoryMB, Subdomain: valid.Subdomain, HealthCheck: valid.HealthCheck, EnvVars: map[string]string{"BAD=KEY": "value"}},
	}

	for name, input := range tests {
		t.Run(name, func(t *testing.T) {
			if _, err := normalizeDeployInput(input); err == nil {
				t.Fatal("normalizeDeployInput() succeeded, want error")
			}
		})
	}
}

func TestValidDNSLabel(t *testing.T) {
	valid := []string{"app", "my-app", "a1"}
	for _, label := range valid {
		if !validDNSLabel(label) {
			t.Fatalf("validDNSLabel(%q) = false, want true", label)
		}
	}

	invalid := []string{"", "-app", "app-", "App", "app.example", strings.Repeat("a", 64)}
	for _, label := range invalid {
		if validDNSLabel(label) {
			t.Fatalf("validDNSLabel(%q) = true, want false", label)
		}
	}
}
