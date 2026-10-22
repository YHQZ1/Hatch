// Package build turns a source revision into a container image.
//
// A Builder is where the build runs: the Hatch host with Docker for the local
// target, or CodeBuild in the user's AWS account. Jobs depend on this
// interface only, so they are tested with the fake in build/fake.
package build

import (
	"context"
	"errors"
)

// ErrCanceled is returned (possibly wrapped) when a build stopped because its
// context was canceled on request.
var ErrCanceled = errors.New("build canceled")

// Spec says what to build.
type Spec struct {
	DeploymentID   string
	RepoURL        string
	Branch         string
	DockerfilePath string
	// CloneToken reads RepoURL and nothing else. It is short-lived and must
	// never be written to a log.
	CloneToken string
}

// Image is a built image that a Runtime can run.
type Image struct {
	URI string
}

// Builder builds images. Build streams its progress to the log sink the
// Builder was created with and stops when ctx is canceled.
type Builder interface {
	Build(ctx context.Context, spec Spec) (Image, error)
	// DeleteImages removes images this Builder produced. Images that are
	// already gone are not an error.
	DeleteImages(ctx context.Context, images []Image) error
}

// Stage names where in a build something failed. They are stored on the
// deployment and shown to the user.
type Stage string

const (
	StageSource Stage = "source_sync"
	StageBuild  Stage = "build"
)

// Error is a build failure that happened in a known stage.
type Error struct {
	Stage Stage
	Err   error
}

func (e *Error) Error() string { return e.Err.Error() }
func (e *Error) Unwrap() error { return e.Err }
