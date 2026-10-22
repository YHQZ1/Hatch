package ecs

import (
	"context"

	"github.com/YHQZ1/hatch/internal/runtime"
)

var _ runtime.Runtime = (*Runtime)(nil)

// Runtime runs apps on ECS Fargate behind a shared ALB. It adapts Deployer to
// runtime.Runtime.
type Runtime struct {
	deployer *Deployer
}

func NewRuntime(deployer *Deployer) *Runtime {
	return &Runtime{deployer: deployer}
}

func (r *Runtime) Deploy(ctx context.Context, spec runtime.DeploySpec, canceled func(context.Context) (bool, error)) (runtime.Release, error) {
	result, err := r.deployer.Deploy(ctx, DeployInput{
		DeploymentID: spec.DeploymentID,
		ImageURI:     spec.ImageURI,
		Port:         spec.Port,
		CPU:          spec.CPU,
		MemoryMB:     spec.MemoryMB,
		HealthCheck:  spec.HealthCheck,
		Subdomain:    spec.Subdomain,
		EnvVars:      spec.EnvVars,
		Canceled:     canceled,
	})
	if err != nil {
		return runtime.Release{}, err
	}
	return runtime.Release{
		PublicURL:      result.PublicURL,
		TaskDefinition: result.TaskDefinitionARN,
		ServiceName:    result.ServiceName,
		TargetGroup:    result.TargetGroupARN,
	}, nil
}

func (r *Runtime) Scale(ctx context.Context, app runtime.AppRef, replicas int32) error {
	return r.deployer.SetServiceDesiredCount(ctx, app.Subdomain, replicas)
}

func (r *Runtime) Destroy(ctx context.Context, app runtime.AppRef) error {
	return r.deployer.Teardown(ctx, app.Subdomain)
}
