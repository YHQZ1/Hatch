// Package fake is an in-memory runtime.Runtime for tests.
package fake

import (
	"context"
	"sync"

	"github.com/YHQZ1/hatch/internal/runtime"
)

// Runtime records the calls it receives and returns scripted results.
type Runtime struct {
	// DeployFunc, when set, replaces the default behaviour (a release at
	// http://<subdomain>.fake).
	DeployFunc func(ctx context.Context, spec runtime.DeploySpec) (runtime.Release, error)
	// DestroyErr and ScaleErr are returned by Destroy and Scale.
	DestroyErr error
	ScaleErr   error

	mu        sync.Mutex
	deploys   []runtime.DeploySpec
	scales    []Scale
	destroyed []runtime.AppRef
}

// Scale is one recorded call to Scale.
type Scale struct {
	App      runtime.AppRef
	Replicas int32
}

func (r *Runtime) Deploy(ctx context.Context, spec runtime.DeploySpec, canceled func(context.Context) (bool, error)) (runtime.Release, error) {
	r.mu.Lock()
	r.deploys = append(r.deploys, spec)
	fn := r.DeployFunc
	r.mu.Unlock()

	if canceled != nil {
		if stop, err := canceled(ctx); err == nil && stop {
			return runtime.Release{}, runtime.ErrCanceled
		}
	}
	if fn != nil {
		return fn(ctx, spec)
	}
	if err := ctx.Err(); err != nil {
		return runtime.Release{}, err
	}
	return runtime.Release{
		PublicURL:      "http://" + spec.Subdomain + ".fake",
		TaskDefinition: "task-" + spec.DeploymentID,
		ServiceName:    "service-" + spec.Subdomain,
		TargetGroup:    "tg-" + spec.Subdomain,
	}, nil
}

func (r *Runtime) Scale(_ context.Context, app runtime.AppRef, replicas int32) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.ScaleErr != nil {
		return r.ScaleErr
	}
	r.scales = append(r.scales, Scale{App: app, Replicas: replicas})
	return nil
}

func (r *Runtime) Destroy(_ context.Context, app runtime.AppRef) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.DestroyErr != nil {
		return r.DestroyErr
	}
	r.destroyed = append(r.destroyed, app)
	return nil
}

// Deploys returns every spec Deploy was called with, in order.
func (r *Runtime) Deploys() []runtime.DeploySpec {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]runtime.DeploySpec(nil), r.deploys...)
}

// Scales returns every successful Scale call, in order.
func (r *Runtime) Scales() []Scale {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]Scale(nil), r.scales...)
}

// Destroyed returns every app Destroy removed, in order.
func (r *Runtime) Destroyed() []runtime.AppRef {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]runtime.AppRef(nil), r.destroyed...)
}
