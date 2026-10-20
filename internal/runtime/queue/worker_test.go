package queue

import (
	"strings"
	"testing"

	ecrtypes "github.com/aws/aws-sdk-go-v2/service/ecr/types"
)

func TestValidateDeployJobAcceptsValidJob(t *testing.T) {
	job := DeployJobEvent{
		DeploymentID: "dep-1",
		ImageURI:     "repo/image:tag",
		CPU:          256,
		MemoryMB:     512,
		Port:         3000,
		HealthCheck:  "/health",
		Subdomain:    "my-app",
	}

	if err := validateDeployJob(job); err != nil {
		t.Fatalf("validateDeployJob() error = %v", err)
	}
}

func TestValidateDeployJobRejectsInvalidJobs(t *testing.T) {
	valid := DeployJobEvent{
		DeploymentID: "dep-1",
		ImageURI:     "repo/image:tag",
		CPU:          256,
		MemoryMB:     512,
		Port:         3000,
		HealthCheck:  "/health",
		Subdomain:    "my-app",
	}

	tests := map[string]DeployJobEvent{
		"missing deployment": {ImageURI: valid.ImageURI, CPU: valid.CPU, MemoryMB: valid.MemoryMB, Port: valid.Port, HealthCheck: valid.HealthCheck, Subdomain: valid.Subdomain},
		"missing image":      {DeploymentID: valid.DeploymentID, CPU: valid.CPU, MemoryMB: valid.MemoryMB, Port: valid.Port, HealthCheck: valid.HealthCheck, Subdomain: valid.Subdomain},
		"missing subdomain":  {DeploymentID: valid.DeploymentID, ImageURI: valid.ImageURI, CPU: valid.CPU, MemoryMB: valid.MemoryMB, Port: valid.Port, HealthCheck: valid.HealthCheck},
		"bad port":           {DeploymentID: valid.DeploymentID, ImageURI: valid.ImageURI, CPU: valid.CPU, MemoryMB: valid.MemoryMB, Port: 0, HealthCheck: valid.HealthCheck, Subdomain: valid.Subdomain},
		"bad cpu":            {DeploymentID: valid.DeploymentID, ImageURI: valid.ImageURI, CPU: 0, MemoryMB: valid.MemoryMB, Port: valid.Port, HealthCheck: valid.HealthCheck, Subdomain: valid.Subdomain},
		"bad memory":         {DeploymentID: valid.DeploymentID, ImageURI: valid.ImageURI, CPU: valid.CPU, MemoryMB: 0, Port: valid.Port, HealthCheck: valid.HealthCheck, Subdomain: valid.Subdomain},
		"long health path":   {DeploymentID: valid.DeploymentID, ImageURI: valid.ImageURI, CPU: valid.CPU, MemoryMB: valid.MemoryMB, Port: valid.Port, HealthCheck: "/" + strings.Repeat("a", 1024), Subdomain: valid.Subdomain},
		"nul health path":    {DeploymentID: valid.DeploymentID, ImageURI: valid.ImageURI, CPU: valid.CPU, MemoryMB: valid.MemoryMB, Port: valid.Port, HealthCheck: "/\x00", Subdomain: valid.Subdomain},
	}

	for name, job := range tests {
		t.Run(name, func(t *testing.T) {
			if err := validateDeployJob(job); err == nil {
				t.Fatal("validateDeployJob() succeeded, want error")
			}
		})
	}
}

func TestValidateCleanupJob(t *testing.T) {
	if err := validateCleanupJob(CleanupJobEvent{ProjectID: "project-1", Slug: "my-app"}); err != nil {
		t.Fatalf("validateCleanupJob() error = %v", err)
	}
	if err := validateCleanupJob(CleanupJobEvent{ProjectID: "project-1"}); err == nil {
		t.Fatal("validateCleanupJob() succeeded without slug")
	}
}

func TestValidateServiceControlJob(t *testing.T) {
	if err := validateServiceControlJob(ServiceControlJobEvent{ProjectID: "project-1", Slug: "my-app", Action: "suspend"}); err != nil {
		t.Fatalf("validateServiceControlJob() error = %v", err)
	}
	if err := validateServiceControlJob(ServiceControlJobEvent{ProjectID: "project-1", Slug: "my-app", Action: "restart"}); err == nil {
		t.Fatal("validateServiceControlJob() succeeded for unsupported action")
	}
}

func TestParseECRImageURI(t *testing.T) {
	ref, ok := parseECRImageURI("123456789012.dkr.ecr.ap-south-1.amazonaws.com/hatch-user-app-builds:tag-1")
	if !ok {
		t.Fatal("parseECRImageURI() ok = false, want true")
	}
	if ref.repository != "hatch-user-app-builds" || ref.tag != "tag-1" {
		t.Fatalf("parseECRImageURI() = %+v", ref)
	}

	ref, ok = parseECRImageURI("123456789012.dkr.ecr.ap-south-1.amazonaws.com/org/repo:tag-2")
	if !ok {
		t.Fatal("parseECRImageURI() nested ok = false, want true")
	}
	if ref.repository != "org/repo" || ref.tag != "tag-2" {
		t.Fatalf("parseECRImageURI() nested = %+v", ref)
	}
}

func TestParseECRImageURIRejectsInvalidRefs(t *testing.T) {
	for _, imageURI := range []string{"", "repo", "registry/repo", "registry/:tag", "registry/repo:"} {
		if _, ok := parseECRImageURI(imageURI); ok {
			t.Fatalf("parseECRImageURI(%q) ok = true, want false", imageURI)
		}
	}
}

func TestCheckECRDeleteFailuresIgnoresMissingImages(t *testing.T) {
	err := checkECRDeleteFailures("repo", []ecrtypes.ImageFailure{
		{FailureCode: ecrtypes.ImageFailureCodeImageNotFound, FailureReason: stringPtr("missing")},
	})
	if err != nil {
		t.Fatalf("checkECRDeleteFailures() error = %v", err)
	}
}

func TestCheckECRDeleteFailuresReturnsRealFailures(t *testing.T) {
	err := checkECRDeleteFailures("repo", []ecrtypes.ImageFailure{
		{FailureCode: ecrtypes.ImageFailureCodeInvalidImageDigest, FailureReason: stringPtr("bad digest")},
	})
	if err == nil {
		t.Fatal("checkECRDeleteFailures() error = nil, want error")
	}
}

func stringPtr(value string) *string {
	return &value
}
