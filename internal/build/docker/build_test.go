package docker

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildContextDefaultsToRootDockerfile(t *testing.T) {
	repo := t.TempDir()
	if err := os.WriteFile(filepath.Join(repo, "Dockerfile"), []byte("FROM scratch\n"), 0644); err != nil {
		t.Fatal(err)
	}

	contextDir, dockerfile, err := buildContext(repo, "")
	if err != nil {
		t.Fatalf("buildContext() error = %v", err)
	}
	if contextDir != repo {
		t.Fatalf("contextDir = %q, want %q", contextDir, repo)
	}
	if dockerfile != "Dockerfile" {
		t.Fatalf("dockerfile = %q, want Dockerfile", dockerfile)
	}
}

func TestBuildContextUsesDockerfileDirectoryAsContext(t *testing.T) {
	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, "apps", "web"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, "apps", "web", "Dockerfile"), []byte("FROM scratch\n"), 0644); err != nil {
		t.Fatal(err)
	}

	contextDir, dockerfile, err := buildContext(repo, "apps/web/Dockerfile")
	if err != nil {
		t.Fatalf("buildContext() error = %v", err)
	}
	if contextDir != filepath.Join(repo, "apps", "web") {
		t.Fatalf("contextDir = %q", contextDir)
	}
	if dockerfile != "Dockerfile" {
		t.Fatalf("dockerfile = %q, want Dockerfile", dockerfile)
	}
}

func TestBuildContextRejectsPathEscape(t *testing.T) {
	repo := t.TempDir()
	for _, path := range []string{"../Dockerfile", "/tmp/Dockerfile", "apps/../../Dockerfile"} {
		if _, _, err := buildContext(repo, path); err == nil {
			t.Fatalf("buildContext(%q) succeeded, want error", path)
		}
	}
}

func TestBuildContextRequiresDockerfileToExist(t *testing.T) {
	repo := t.TempDir()
	if _, _, err := buildContext(repo, "Dockerfile"); err == nil {
		t.Fatal("buildContext() succeeded without Dockerfile")
	}
}

func TestImageTagSanitizesDeploymentID(t *testing.T) {
	got := imageTag(" deploy/id:with spaces ")
	if got != "deploy-id-with-spaces" {
		t.Fatalf("imageTag() = %q", got)
	}

	long := strings.Repeat("a", 140)
	if got := imageTag(long); len(got) != 128 {
		t.Fatalf("imageTag(long) length = %d, want 128", len(got))
	}
}

func TestCaptureIgnoresClosedPipeAfterCommandExit(t *testing.T) {
	builder := &Builder{}
	builder.capture(context.Background(), "deployment-1", closedReader{})
}

type closedReader struct{}

func (closedReader) Read([]byte) (int, error) {
	return 0, os.ErrClosed
}

var _ io.Reader = closedReader{}
