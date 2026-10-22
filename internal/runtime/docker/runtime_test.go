package docker

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/YHQZ1/hatch/internal/proxy"
	"github.com/YHQZ1/hatch/internal/runtime"
)

type fakeContainer struct {
	name    string
	app     string
	running bool
	port    int32
	logs    string
}

// fakeDocker is just enough of docker to run Runtime against: containers, a
// network, and the commands Runtime issues.
type fakeDocker struct {
	mu         sync.Mutex
	containers []fakeContainer // newest first
	network    bool
	calls      [][]string
	envFile    string // the content of the --env-file, read when run was called
	state      string // what inspect reports for a new container
	failRun    error
}

func newFakeDocker() *fakeDocker { return &fakeDocker{state: "running"} }

func (f *fakeDocker) names() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []string
	for _, c := range f.containers {
		out = append(out, c.name)
	}
	return out
}

func (f *fakeDocker) called(prefix ...string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, c := range f.calls {
		if len(c) >= len(prefix) && strings.Join(c[:len(prefix)], " ") == strings.Join(prefix, " ") {
			n++
		}
	}
	return n
}

func flag(args []string, name string) string {
	for i, a := range args {
		if a == name && i+1 < len(args) {
			return args[i+1]
		}
	}
	return ""
}

func (f *fakeDocker) run(_ context.Context, args ...string) (Output, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, args)
	find := func(name string) int {
		for i, c := range f.containers {
			if c.name == name {
				return i
			}
		}
		return -1
	}
	switch args[0] {
	case "network":
		if args[1] == "inspect" && !f.network {
			return Output{}, errors.New("no such network")
		}
		if args[1] == "create" {
			f.network = true
		}
		return Output{}, nil
	case "run":
		if f.failRun != nil {
			return Output{}, f.failRun
		}
		var app string
		var port int32
		for i, a := range args {
			if a == "--label" && strings.HasPrefix(args[i+1], labelApp+"=") {
				app = strings.TrimPrefix(args[i+1], labelApp+"=")
			}
			if a == "--label" && strings.HasPrefix(args[i+1], labelPort+"=") {
				n, _ := strconv.Atoi(strings.TrimPrefix(args[i+1], labelPort+"="))
				port = int32(n)
			}
		}
		if path := flag(args, "--env-file"); path != "" {
			data, _ := os.ReadFile(path)
			f.envFile = string(data)
		}
		f.containers = append([]fakeContainer{{name: flag(args, "--name"), app: app, running: true, port: port, logs: "listening on 8080"}}, f.containers...)
		return Output{Stdout: "abc123\n"}, nil
	case "inspect":
		i := find(args[len(args)-1])
		if i < 0 {
			return Output{}, errors.New("Error: No such container")
		}
		if f.containers[i].running {
			return Output{Stdout: f.state + "\n"}, nil
		}
		return Output{Stdout: "exited\n"}, nil
	case "port":
		if find(args[1]) < 0 {
			return Output{}, errors.New("Error: No such container")
		}
		return Output{Stdout: "127.0.0.1:49153\n"}, nil
	case "ps":
		app := ""
		for i, a := range args {
			if a == "--filter" && strings.HasPrefix(args[i+1], "label="+labelApp+"=") {
				app = strings.TrimPrefix(args[i+1], "label="+labelApp+"=")
			}
		}
		var lines []string
		for _, c := range f.containers {
			if c.app != app {
				continue
			}
			state := "exited"
			if c.running {
				state = "running"
			}
			lines = append(lines, fmt.Sprintf("%s\t%s\t%d", c.name, state, c.port))
		}
		return Output{Stdout: strings.Join(lines, "\n")}, nil
	case "rm":
		if i := find(args[len(args)-1]); i >= 0 {
			f.containers = append(f.containers[:i], f.containers[i+1:]...)
		}
		return Output{}, nil
	case "stop", "start":
		i := find(args[1])
		if i < 0 {
			return Output{}, errors.New("Error: No such container")
		}
		f.containers[i].running = args[0] == "start"
		return Output{}, nil
	case "logs":
		if i := find(args[len(args)-1]); i >= 0 {
			return Output{Stdout: f.containers[i].logs}, nil
		}
		return Output{}, errors.New("Error: No such container")
	}
	return Output{}, fmt.Errorf("fakeDocker: unexpected command %v", args)
}

type sink struct {
	mu    sync.Mutex
	lines []string
}

func (s *sink) Publish(_ context.Context, _, line string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lines = append(s.lines, line)
}

func (s *sink) text() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return strings.Join(s.lines, "\n")
}

func newRuntime(f *fakeDocker) (*Runtime, *sink) {
	logs := &sink{}
	r := New(logs, func(sub string) string { return "http://" + sub + ".localhost:8081" })
	r.run = f.run
	r.healthTimeout = 200 * time.Millisecond
	r.healthInterval = time.Millisecond
	r.probe = func(context.Context, string) (int, error) { return 200, nil }
	return r, logs
}

func specFor(deployment string) runtime.DeploySpec {
	return runtime.DeploySpec{
		DeploymentID: deployment, ImageURI: "hatch-local:" + deployment, Subdomain: "shop",
		Port: 8080, CPU: 512, MemoryMB: 1024, HealthCheck: "/health",
	}
}

func TestDeployStartsAContainerAndReturnsTheAppAddress(t *testing.T) {
	f := newFakeDocker()
	r, logs := newRuntime(f)
	spec := specFor("11111111-2222-3333-4444-555555555555")
	spec.EnvVars = map[string]string{"API_KEY": "s3cret"}

	release, err := r.Deploy(context.Background(), spec, nil)

	if err != nil {
		t.Fatal(err)
	}
	if release.PublicURL != "http://shop.localhost:8081" || release.ServiceName != "hatch-shop-111111112222" {
		t.Errorf("release = %+v", release)
	}
	if got := f.names(); len(got) != 1 || got[0] != "hatch-shop-111111112222" {
		t.Errorf("containers = %v", got)
	}
	if f.called("network", "create") != 1 {
		t.Error("the network was not created")
	}
	run := f.calls[indexOf(f, "run")]
	for _, want := range []string{"--detach", "--restart", "unless-stopped", "--publish", "127.0.0.1::8080", "--cpus", "0.50", "--memory", "1024m"} {
		if !contains(run, want) {
			t.Errorf("docker run is missing %q: %v", want, run)
		}
	}
	if strings.Contains(strings.Join(run, " "), "s3cret") {
		t.Error("an environment value is on the docker command line")
	}
	if !strings.Contains(f.envFile, "API_KEY=s3cret") {
		t.Errorf("env file = %q", f.envFile)
	}
	if !strings.Contains(logs.text(), "Deployment live at: http://shop.localhost:8081") {
		t.Errorf("logs = %s", logs.text())
	}
}

func indexOf(f *fakeDocker, command string) int {
	for i, c := range f.calls {
		if c[0] == command {
			return i
		}
	}
	return -1
}

func contains(args []string, want string) bool {
	for _, a := range args {
		if a == want {
			return true
		}
	}
	return false
}

func TestARetriedDeployReplacesTheContainerItLeftBehind(t *testing.T) {
	f := newFakeDocker()
	r, _ := newRuntime(f)
	// The first attempt was interrupted after starting its container.
	f.containers = []fakeContainer{{name: "hatch-shop-d1", app: "shop", running: true, port: 8080}}

	if _, err := r.Deploy(context.Background(), specFor("d1"), nil); err != nil {
		t.Fatal(err)
	}

	if got := f.names(); len(got) != 1 || got[0] != "hatch-shop-d1" {
		t.Errorf("containers = %v, want a single fresh one", got)
	}
}

func TestTheEnvFileIsRemovedAfterTheDeploy(t *testing.T) {
	f := newFakeDocker()
	r, _ := newRuntime(f)
	spec := specFor("d1")
	spec.EnvVars = map[string]string{"A": "1"}

	if _, err := r.Deploy(context.Background(), spec, nil); err != nil {
		t.Fatal(err)
	}

	path := flag(f.calls[indexOf(f, "run")], "--env-file")
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("env file %s still exists (%v)", path, err)
	}
}

func TestANewVersionReplacesTheOldOneOnlyOnceHealthy(t *testing.T) {
	f := newFakeDocker()
	r, _ := newRuntime(f)
	if _, err := r.Deploy(context.Background(), specFor("aaaaaaaa1"), nil); err != nil {
		t.Fatal(err)
	}

	// While the new version is being checked, the old one must still be there.
	r.probe = func(context.Context, string) (int, error) {
		if got := f.names(); len(got) != 2 {
			t.Errorf("containers during the health check = %v, want old and new", got)
		}
		return 200, nil
	}
	if _, err := r.Deploy(context.Background(), specFor("bbbbbbbb2"), nil); err != nil {
		t.Fatal(err)
	}

	if got := f.names(); len(got) != 1 || got[0] != "hatch-shop-bbbbbbbb2" {
		t.Errorf("containers = %v, want only the new version", got)
	}
}

func TestAFailedHealthCheckKeepsTheOldVersionAndRemovesTheNewOne(t *testing.T) {
	f := newFakeDocker()
	r, _ := newRuntime(f)
	if _, err := r.Deploy(context.Background(), specFor("aaaaaaaa1"), nil); err != nil {
		t.Fatal(err)
	}
	r.probe = func(context.Context, string) (int, error) { return 503, nil }

	_, err := r.Deploy(context.Background(), specFor("bbbbbbbb2"), nil)

	if err == nil || !strings.Contains(err.Error(), "health check") || !strings.Contains(err.Error(), "answered 503") {
		t.Fatalf("err = %v", err)
	}
	if !strings.Contains(err.Error(), "listening on 8080") {
		t.Errorf("err = %v, want the app's last output in it", err)
	}
	if got := f.names(); len(got) != 1 || got[0] != "hatch-shop-aaaaaaaa1" {
		t.Errorf("containers = %v, want only the old version", got)
	}
}

func TestAContainerThatStopsFailsTheDeployAtOnce(t *testing.T) {
	f := newFakeDocker()
	f.state = "exited"
	r, _ := newRuntime(f)
	r.healthTimeout = time.Minute // it must not wait this out
	started := time.Now()

	_, err := r.Deploy(context.Background(), specFor("d1"), nil)

	if err == nil || !strings.Contains(err.Error(), "stopped (exited)") {
		t.Fatalf("err = %v", err)
	}
	if time.Since(started) > 5*time.Second {
		t.Error("the deploy waited for the timeout instead of failing")
	}
	if len(f.names()) != 0 {
		t.Errorf("containers = %v, want none left", f.names())
	}
}

func TestACanceledDeployRemovesWhatItStarted(t *testing.T) {
	f := newFakeDocker()
	r, _ := newRuntime(f)
	polls := 0
	r.probe = func(context.Context, string) (int, error) { return 503, nil }
	canceled := func(context.Context) (bool, error) {
		polls++
		return polls > 3, nil
	}

	_, err := r.Deploy(context.Background(), specFor("d1"), canceled)

	if !errors.Is(err, runtime.ErrCanceled) {
		t.Fatalf("err = %v, want ErrCanceled", err)
	}
	if len(f.names()) != 0 {
		t.Errorf("containers = %v, want none left", f.names())
	}
}

func TestACanceledDeployNeverStartsAnything(t *testing.T) {
	f := newFakeDocker()
	r, _ := newRuntime(f)

	_, err := r.Deploy(context.Background(), specFor("d1"), func(context.Context) (bool, error) { return true, nil })

	if !errors.Is(err, runtime.ErrCanceled) || f.called("run") != 0 {
		t.Fatalf("err = %v, run calls = %d", err, f.called("run"))
	}
}

func TestAStartThatFailsLeavesNothingBehind(t *testing.T) {
	f := newFakeDocker()
	f.failRun = errors.New("docker run: pull access denied")
	r, _ := newRuntime(f)

	_, err := r.Deploy(context.Background(), specFor("d1"), nil)

	if err == nil || !strings.Contains(err.Error(), "pull access denied") {
		t.Fatalf("err = %v", err)
	}
	if f.called("rm") == 0 {
		t.Error("a half-created container was not cleaned up")
	}
}

func TestDeployRejectsSpecsThatCouldInjectDockerArguments(t *testing.T) {
	tests := map[string]func(*runtime.DeploySpec){
		"subdomain with a flag": func(s *runtime.DeploySpec) { s.Subdomain = "--privileged" },
		"subdomain with a dot":  func(s *runtime.DeploySpec) { s.Subdomain = "a.b" },
		"image that is a flag":  func(s *runtime.DeploySpec) { s.ImageURI = "--privileged" },
		"bad port":              func(s *runtime.DeploySpec) { s.Port = 0 },
		"health check no slash": func(s *runtime.DeploySpec) { s.HealthCheck = "health" },
		"no memory":             func(s *runtime.DeploySpec) { s.MemoryMB = 0 },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			f := newFakeDocker()
			r, _ := newRuntime(f)
			spec := specFor("d1")
			mutate(&spec)

			if _, err := r.Deploy(context.Background(), spec, nil); err == nil {
				t.Fatal("the spec was accepted")
			}
			if len(f.calls) != 0 {
				t.Errorf("docker was called: %v", f.calls)
			}
		})
	}
}

func TestEnvValuesDockerCannotPassAreRejected(t *testing.T) {
	f := newFakeDocker()
	r, _ := newRuntime(f)
	spec := specFor("d1")
	spec.EnvVars = map[string]string{"KEY": "line one\nline two"}

	_, err := r.Deploy(context.Background(), spec, nil)

	if err == nil || !strings.Contains(err.Error(), "KEY") || f.called("run") != 0 {
		t.Fatalf("err = %v, run calls = %d", err, f.called("run"))
	}
}

func TestScalePausesAndResumes(t *testing.T) {
	f := newFakeDocker()
	r, _ := newRuntime(f)
	if _, err := r.Deploy(context.Background(), specFor("aaaaaaaa1"), nil); err != nil {
		t.Fatal(err)
	}
	app := runtime.AppRef{Subdomain: "shop"}

	if err := r.Scale(context.Background(), app, 0); err != nil {
		t.Fatal(err)
	}
	if f.containers[0].running {
		t.Error("the container is still running after pause")
	}
	if _, err := r.Resolve(context.Background(), "shop"); !errors.Is(err, proxy.ErrStopped) {
		t.Errorf("Resolve after pause = %v, want ErrStopped", err)
	}

	if err := r.Scale(context.Background(), app, 1); err != nil {
		t.Fatal(err)
	}
	if !f.containers[0].running {
		t.Error("the container is not running after resume")
	}
	if addr, err := r.Resolve(context.Background(), "shop"); err != nil || addr != "127.0.0.1:49153" {
		t.Errorf("Resolve after resume = %q, %v", addr, err)
	}
}

func TestScaleOfAnAppWithNoContainerFails(t *testing.T) {
	r, _ := newRuntime(newFakeDocker())

	if err := r.Scale(context.Background(), runtime.AppRef{Subdomain: "shop"}, 0); err == nil {
		t.Fatal("scaling an app that has no container succeeded")
	}
}

func TestDestroyRemovesEveryContainerOfTheApp(t *testing.T) {
	f := newFakeDocker()
	r, _ := newRuntime(f)
	f.containers = []fakeContainer{{name: "hatch-shop-2", app: "shop"}, {name: "hatch-shop-1", app: "shop", running: true}, {name: "hatch-blog-1", app: "blog", running: true}}

	if err := r.Destroy(context.Background(), runtime.AppRef{Subdomain: "shop"}); err != nil {
		t.Fatal(err)
	}

	if got := f.names(); len(got) != 1 || got[0] != "hatch-blog-1" {
		t.Errorf("containers = %v, want only the other app's", got)
	}
	if err := r.Destroy(context.Background(), runtime.AppRef{Subdomain: "shop"}); err != nil {
		t.Errorf("destroying an app that is already gone: %v", err)
	}
}

func TestResolveFindsTheServingContainer(t *testing.T) {
	f := newFakeDocker()
	r, _ := newRuntime(f)
	// A new version has started beside the old one, newest first.
	f.containers = []fakeContainer{{name: "new", app: "shop", running: true, port: 8080}, {name: "old", app: "shop", running: true, port: 8080}}

	if _, err := r.Resolve(context.Background(), "shop"); err != nil {
		t.Fatal(err)
	}

	if last := f.calls[len(f.calls)-1]; last[0] != "port" || last[1] != "old" {
		t.Errorf("last docker call = %v, want the port of the old container", last)
	}
}

func TestResolveReportsMissingApps(t *testing.T) {
	r, _ := newRuntime(newFakeDocker())

	if _, err := r.Resolve(context.Background(), "nothing"); !errors.Is(err, proxy.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
	if _, err := r.Resolve(context.Background(), "../etc"); !errors.Is(err, proxy.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound for an invalid name", err)
	}
}

func TestWriteEnvFileRejectsBadNames(t *testing.T) {
	for _, key := range []string{"", "A=B", "A\nB"} {
		if _, err := writeEnvFile(map[string]string{key: "v"}); err == nil {
			t.Errorf("name %q was accepted", key)
		}
	}
}
