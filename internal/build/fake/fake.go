// Package fake is an in-memory build.Builder for tests.
package fake

import (
	"context"
	"sync"

	"github.com/YHQZ1/hatch/internal/build"
)

// Builder records the builds it was asked for and returns scripted results.
type Builder struct {
	// BuildFunc, when set, replaces the default behaviour (an image named after
	// the deployment).
	BuildFunc func(ctx context.Context, spec build.Spec) (build.Image, error)

	mu      sync.Mutex
	built   []build.Spec
	deleted []build.Image
}

func (b *Builder) Build(ctx context.Context, spec build.Spec) (build.Image, error) {
	b.mu.Lock()
	b.built = append(b.built, spec)
	fn := b.BuildFunc
	b.mu.Unlock()

	if fn != nil {
		return fn(ctx, spec)
	}
	if err := ctx.Err(); err != nil {
		return build.Image{}, err
	}
	return build.Image{URI: "fake.registry/hatch:" + spec.DeploymentID}, nil
}

func (b *Builder) DeleteImages(_ context.Context, images []build.Image) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.deleted = append(b.deleted, images...)
	return nil
}

// Built returns the specs of every build started, in order.
func (b *Builder) Built() []build.Spec {
	b.mu.Lock()
	defer b.mu.Unlock()
	return append([]build.Spec(nil), b.built...)
}

// Deleted returns every image DeleteImages was asked to remove.
func (b *Builder) Deleted() []build.Image {
	b.mu.Lock()
	defer b.mu.Unlock()
	return append([]build.Image(nil), b.deleted...)
}
