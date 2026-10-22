package jobs

import (
	"testing"

	"github.com/google/uuid"
)

func validBuild() BuildArgs {
	return BuildArgs{
		DeploymentID: uuid.New(), RepoURL: "https://github.com/octo/shop", Branch: "main",
		DockerfilePath: "Dockerfile", Subdomain: "shop", Port: 8080, CPU: 256, MemoryMB: 512, HealthCheck: "/",
	}
}

func validDeploy() DeployArgs {
	return DeployArgs{
		DeploymentID: uuid.New(), ImageURI: "registry/app:1", Subdomain: "shop",
		Port: 8080, CPU: 256, MemoryMB: 512, HealthCheck: "/",
	}
}

func TestBuildArgsValidate(t *testing.T) {
	if err := validBuild().Validate(); err != nil {
		t.Fatalf("valid args rejected: %v", err)
	}
	tests := map[string]func(*BuildArgs){
		"no deployment":     func(a *BuildArgs) { a.DeploymentID = uuid.Nil },
		"no repository":     func(a *BuildArgs) { a.RepoURL = " " },
		"port too low":      func(a *BuildArgs) { a.Port = 0 },
		"port too high":     func(a *BuildArgs) { a.Port = 70000 },
		"no cpu":            func(a *BuildArgs) { a.CPU = 0 },
		"no memory":         func(a *BuildArgs) { a.MemoryMB = 0 },
		"long dockerfile":   func(a *BuildArgs) { a.DockerfilePath = string(make([]byte, 513)) },
		"nul in dockerfile": func(a *BuildArgs) { a.DockerfilePath = "Docker\x00file" },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			args := validBuild()
			mutate(&args)
			if err := args.Validate(); err == nil {
				t.Fatal("invalid args accepted")
			}
		})
	}
}

func TestDeployArgsValidate(t *testing.T) {
	if err := validDeploy().Validate(); err != nil {
		t.Fatalf("valid args rejected: %v", err)
	}
	tests := map[string]func(*DeployArgs){
		"no deployment":     func(a *DeployArgs) { a.DeploymentID = uuid.Nil },
		"no image":          func(a *DeployArgs) { a.ImageURI = "" },
		"no subdomain":      func(a *DeployArgs) { a.Subdomain = " " },
		"bad port":          func(a *DeployArgs) { a.Port = -1 },
		"no cpu":            func(a *DeployArgs) { a.CPU = 0 },
		"no memory":         func(a *DeployArgs) { a.MemoryMB = 0 },
		"long health check": func(a *DeployArgs) { a.HealthCheck = string(make([]byte, 1025)) },
		"nul in health":     func(a *DeployArgs) { a.HealthCheck = "/he\x00alth" },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			args := validDeploy()
			mutate(&args)
			if err := args.Validate(); err == nil {
				t.Fatal("invalid args accepted")
			}
		})
	}
}

func TestDestroyAndScaleArgsValidate(t *testing.T) {
	if err := (DestroyAppArgs{ProjectID: uuid.New(), Subdomain: "shop"}).Validate(); err != nil {
		t.Errorf("valid destroy args rejected: %v", err)
	}
	if (DestroyAppArgs{Subdomain: "shop"}).Validate() == nil || (DestroyAppArgs{ProjectID: uuid.New()}).Validate() == nil {
		t.Error("incomplete destroy args accepted")
	}
	for _, replicas := range []int32{0, 1} {
		if err := (ScaleArgs{ProjectID: uuid.New(), Subdomain: "shop", Replicas: replicas}).Validate(); err != nil {
			t.Errorf("replicas %d rejected: %v", replicas, err)
		}
	}
	if (ScaleArgs{ProjectID: uuid.New(), Subdomain: "shop", Replicas: 5}).Validate() == nil {
		t.Error("5 replicas accepted: only pause and resume are supported")
	}
}

func TestEveryJobKindIsDistinct(t *testing.T) {
	kinds := map[string]bool{}
	for _, kind := range []string{BuildArgs{}.Kind(), DeployArgs{}.Kind(), DestroyAppArgs{}.Kind(), ScaleArgs{}.Kind()} {
		if kinds[kind] {
			t.Fatalf("duplicate job kind %q", kind)
		}
		kinds[kind] = true
	}
}
