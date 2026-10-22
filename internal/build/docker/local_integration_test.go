package docker

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/YHQZ1/hatch/internal/build"
	"github.com/YHQZ1/hatch/internal/stream"
)

// requireDocker skips the test unless HATCH_TEST_DOCKER=1 and Docker answers.
// These tests build and run real containers, so they are opt-in.
func requireDocker(t *testing.T) {
	t.Helper()
	if os.Getenv("HATCH_TEST_DOCKER") != "1" {
		t.Skip("set HATCH_TEST_DOCKER=1 to run tests that use Docker")
	}
	if err := exec.Command("docker", "info").Run(); err != nil {
		t.Skipf("Docker is not available: %v", err)
	}
}

func TestLocalBuilderBuildsAnImageInTheHostsDocker(t *testing.T) {
	requireDocker(t)
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "Dockerfile"), []byte("FROM busybox:1.37\nCMD [\"true\"]\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	b := NewLocalBuilder(stream.Discard{})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	uri, err := b.buildAndPush(ctx, "it-local-build", dir, "Dockerfile")

	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = b.DeleteImages(context.Background(), []build.Image{{URI: uri}}) })
	if uri != "hatch-local:it-local-build" {
		t.Errorf("image = %q", uri)
	}
	if out, err := exec.Command("docker", "image", "inspect", uri).CombinedOutput(); err != nil {
		t.Fatalf("the image is not in Docker: %s", out)
	}

	if err := b.DeleteImages(ctx, []build.Image{{URI: uri}}); err != nil {
		t.Fatal(err)
	}
	if err := exec.Command("docker", "image", "inspect", uri).Run(); err == nil {
		t.Error("the image is still in Docker after DeleteImages")
	}
	if err := b.DeleteImages(ctx, []build.Image{{URI: uri}}); err != nil {
		t.Errorf("deleting an image that is already gone: %v", err)
	}
}

func TestLocalBuilderFailsABuildWithABrokenDockerfile(t *testing.T) {
	requireDocker(t)
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "Dockerfile"), []byte("FROM busybox:1.37\nRUN exit 3\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	b := NewLocalBuilder(stream.Discard{})

	_, err := b.buildAndPush(context.Background(), "it-local-broken", dir, "Dockerfile")

	if err == nil || !strings.Contains(err.Error(), "docker build failed") {
		t.Fatalf("err = %v", err)
	}
}

func TestDeleteImagesLeavesOtherRepositoriesAlone(t *testing.T) {
	b := NewLocalBuilder(stream.Discard{})
	// No Docker needed: an image that is not the local builder's is skipped
	// before docker is run.
	if err := b.DeleteImages(context.Background(), []build.Image{{URI: "postgres:17"}, {URI: "123.dkr.ecr.x.amazonaws.com/r:t"}}); err != nil {
		t.Fatal(err)
	}
}
