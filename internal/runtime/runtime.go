// Package runtime runs built images as services.
//
// A Runtime is where apps run: Docker containers for the local target, or ECS
// in the user's AWS account. Jobs depend on this interface only, so they are
// tested with the fake in runtime/fake.
package runtime

import (
	"context"
	"errors"
)

// ErrCanceled is returned (possibly wrapped) when a deploy stopped because it
// was canceled on request.
var ErrCanceled = errors.New("deployment canceled")

// DeploySpec says what to run.
type DeploySpec struct {
	DeploymentID string
	ImageURI     string
	Subdomain    string
	Port         int32
	CPU          int32
	MemoryMB     int32
	HealthCheck  string
	// EnvVars holds plain-text values, decrypted for this call only.
	EnvVars map[string]string
}

// Release is a running deployment.
type Release struct {
	PublicURL string
	// The remaining fields identify provider resources (ARNs on AWS) and are
	// stored on the deployment.
	TaskDefinition string
	ServiceName    string
	TargetGroup    string
}

// AppRef names an app, by the subdomain it is served on.
type AppRef struct {
	Subdomain string
}

// Runtime runs services. Deploy streams its progress to the log sink the
// Runtime was created with.
type Runtime interface {
	// Deploy creates or updates the service and waits until it is healthy. The
	// Runtime calls canceled between steps and stops with ErrCanceled when it
	// reports true.
	Deploy(ctx context.Context, spec DeploySpec, canceled func(context.Context) (bool, error)) (Release, error)
	// Scale sets the number of running copies. Zero pauses the app.
	Scale(ctx context.Context, app AppRef, replicas int32) error
	// Destroy removes everything Hatch created to run the app.
	Destroy(ctx context.Context, app AppRef) error
}
