package docker

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/YHQZ1/hatch/internal/proxy"
	"github.com/YHQZ1/hatch/internal/runtime"
	"github.com/YHQZ1/hatch/internal/stream"
)

// buildImage builds a busybox web server that answers GET / with body and
// GET /health with 200, and returns its tag.
func buildImage(t *testing.T, tag, body string) {
	t.Helper()
	dir := t.TempDir()
	dockerfile := "FROM busybox:1.37\nRUN mkdir /www && echo '" + body + "' > /www/index.html && echo ok > /www/health\nCMD [\"httpd\", \"-f\", \"-p\", \"8080\", \"-h\", \"/www\"]\n"
	if err := os.WriteFile(filepath.Join(dir, "Dockerfile"), []byte(dockerfile), 0o644); err != nil {
		t.Fatal(err)
	}
	if out, err := exec.Command("docker", "build", "-q", "-t", tag, dir).CombinedOutput(); err != nil {
		t.Fatalf("docker build: %s", out)
	}
	t.Cleanup(func() { _ = exec.Command("docker", "rmi", "-f", tag).Run() })
}

func fetch(t *testing.T, h http.Handler, host string) (int, string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "http://"+host+"/", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	body, _ := io.ReadAll(rec.Body)
	return rec.Code, strings.TrimSpace(string(body))
}

// TestAppsRunThroughDockerAndTheProxy is the whole local target with real
// containers: deploy, serve through the proxy, roll out a new version, pause,
// resume, destroy. Opt in with HATCH_TEST_DOCKER=1.
func TestAppsRunThroughDockerAndTheProxy(t *testing.T) {
	if os.Getenv("HATCH_TEST_DOCKER") != "1" {
		t.Skip("set HATCH_TEST_DOCKER=1 to run tests that use Docker")
	}
	if err := Available(context.Background(), Exec); err != nil {
		t.Skip(err)
	}
	buildImage(t, "hatch-it:v1", "version one")
	buildImage(t, "hatch-it:v2", "version two")

	const app = "hatch-it-app"
	rt := New(stream.Discard{}, func(sub string) string { return "http://" + sub + ".localhost" })
	rt.healthTimeout = time.Minute
	ref := runtime.AppRef{Subdomain: app}
	t.Cleanup(func() { _ = rt.Destroy(context.Background(), ref) })
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	front := proxy.New(rt, "localhost")
	host := app + ".localhost"

	deploy := func(id, image string) {
		t.Helper()
		release, err := rt.Deploy(ctx, runtime.DeploySpec{
			DeploymentID: id, ImageURI: image, Subdomain: app, Port: 8080, CPU: 256, MemoryMB: 128, HealthCheck: "/health",
			EnvVars: map[string]string{"GREETING": "hello"},
		}, nil)
		if err != nil {
			t.Fatalf("deploy %s: %v", id, err)
		}
		if release.PublicURL != "http://"+host {
			t.Errorf("public URL = %q", release.PublicURL)
		}
	}

	deploy("11111111-1111-1111-1111-111111111111", "hatch-it:v1")
	if code, body := fetch(t, front, host); code != 200 || body != "version one" {
		t.Fatalf("after v1: %d %q", code, body)
	}

	deploy("22222222-2222-2222-2222-222222222222", "hatch-it:v2")
	if code, body := fetch(t, front, host); code != 200 || body != "version two" {
		// The proxy remembers a lookup for a few seconds.
		time.Sleep(proxyCacheWait)
		if code, body = fetch(t, front, host); code != 200 || body != "version two" {
			t.Fatalf("after v2: %d %q", code, body)
		}
	}
	if cs, err := rt.containers(ctx, app); err != nil || len(cs) != 1 {
		t.Fatalf("containers after the rollout = %v, %v; want only the new one", cs, err)
	}

	if err := rt.Scale(ctx, ref, 0); err != nil {
		t.Fatal(err)
	}
	time.Sleep(proxyCacheWait)
	if code, _ := fetch(t, front, host); code != http.StatusServiceUnavailable {
		t.Errorf("paused app: status %d, want 503", code)
	}

	if err := rt.Scale(ctx, ref, 1); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(30 * time.Second)
	for {
		time.Sleep(proxyCacheWait)
		if code, body := fetch(t, front, host); code == 200 && body == "version two" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the app did not come back after resume")
		}
	}

	if err := rt.Destroy(ctx, ref); err != nil {
		t.Fatal(err)
	}
	time.Sleep(proxyCacheWait)
	if code, _ := fetch(t, front, host); code != http.StatusNotFound {
		t.Errorf("destroyed app: status %d, want 404", code)
	}
}

// proxyCacheWait is longer than the proxy's lookup cache.
const proxyCacheWait = 3500 * time.Millisecond

func TestAFailingAppFailsTheDeployAndLeavesNothing(t *testing.T) {
	if os.Getenv("HATCH_TEST_DOCKER") != "1" {
		t.Skip("set HATCH_TEST_DOCKER=1 to run tests that use Docker")
	}
	if err := Available(context.Background(), Exec); err != nil {
		t.Skip(err)
	}
	buildImage(t, "hatch-it:crash", "never served")
	rt := New(stream.Discard{}, func(sub string) string { return "http://" + sub + ".localhost" })
	rt.healthTimeout = 20 * time.Second
	t.Cleanup(func() { _ = rt.Destroy(context.Background(), runtime.AppRef{Subdomain: "hatch-it-crash"}) })

	// The image serves on 8080, but the spec asks for the wrong port, so the
	// health check never passes.
	_, err := rt.Deploy(context.Background(), runtime.DeploySpec{
		DeploymentID: "33333333-3333-3333-3333-333333333333", ImageURI: "hatch-it:crash", Subdomain: "hatch-it-crash",
		Port: 9999, CPU: 256, MemoryMB: 128, HealthCheck: "/health",
	}, nil)

	if err == nil || !strings.Contains(err.Error(), "health check") {
		t.Fatalf("err = %v", err)
	}
	if cs, err := rt.containers(context.Background(), "hatch-it-crash"); err != nil || len(cs) != 0 {
		t.Errorf("containers left behind: %v, %v", cs, err)
	}
}
