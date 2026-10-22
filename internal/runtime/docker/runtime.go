package docker

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/YHQZ1/hatch/internal/proxy"
	"github.com/YHQZ1/hatch/internal/runtime"
	"github.com/YHQZ1/hatch/internal/stream"
)

const (
	networkName = "hatch"

	labelManaged    = "hatch.managed"
	labelApp        = "hatch.app"
	labelDeployment = "hatch.deployment"
	labelPort       = "hatch.port"
)

var (
	_ runtime.Runtime = (*Runtime)(nil)
	_ proxy.Resolver  = (*Runtime)(nil)
)

// Runtime runs apps as containers. It implements runtime.Runtime and, for the
// built-in proxy, proxy.Resolver.
type Runtime struct {
	run       Command
	logs      stream.Sink
	publicURL func(subdomain string) string

	// How long Deploy waits for the app to answer its health check, and how
	// often it asks. Tests shorten them.
	healthTimeout  time.Duration
	healthInterval time.Duration
	probe          func(ctx context.Context, url string) (status int, err error)
}

// New returns a Runtime that reports progress to logs. publicURL gives the
// address an app is reached at.
func New(logs stream.Sink, publicURL func(subdomain string) string) *Runtime {
	return &Runtime{
		run:            Exec,
		logs:           logs,
		publicURL:      publicURL,
		healthTimeout:  2 * time.Minute,
		healthInterval: time.Second,
		probe:          httpProbe,
	}
}

// Deploy starts the image as a new container, waits until it answers its health
// check, then retires the app's previous containers. The previous version keeps
// serving until the new one is healthy. Anything this call started is removed
// again if it fails or is canceled.
func (r *Runtime) Deploy(ctx context.Context, spec runtime.DeploySpec, canceled func(context.Context) (bool, error)) (runtime.Release, error) {
	if err := validate(spec); err != nil {
		return runtime.Release{}, err
	}
	id := spec.DeploymentID
	sub := spec.Subdomain
	healthPath := strings.TrimSpace(spec.HealthCheck)
	if healthPath == "" {
		healthPath = "/"
	}
	check := func() error {
		if canceled == nil {
			return nil
		}
		stop, err := canceled(ctx)
		if err != nil {
			return err
		}
		if stop {
			return runtime.ErrCanceled
		}
		return nil
	}

	if err := check(); err != nil {
		return runtime.Release{}, err
	}
	if err := r.ensureNetwork(ctx); err != nil {
		return runtime.Release{}, err
	}

	name := fmt.Sprintf("hatch-%s-%s", sub, shortID(id))
	args := []string{
		"run", "--detach",
		"--name", name,
		"--network", networkName,
		"--restart", "unless-stopped",
		"--cpus", fmt.Sprintf("%.2f", float64(spec.CPU)/1024),
		"--memory", fmt.Sprintf("%dm", spec.MemoryMB),
		"--publish", fmt.Sprintf("127.0.0.1::%d", spec.Port),
		"--label", labelManaged + "=true",
		"--label", labelApp + "=" + sub,
		"--label", labelDeployment + "=" + id,
		"--label", fmt.Sprintf("%s=%d", labelPort, spec.Port),
	}
	if len(spec.EnvVars) > 0 {
		path, err := writeEnvFile(spec.EnvVars)
		if err != nil {
			return runtime.Release{}, err
		}
		defer os.Remove(path)
		args = append(args, "--env-file", path)
	}
	args = append(args, spec.ImageURI)

	// A container with this name is left over from an earlier attempt at this
	// same deployment (a job that was interrupted and ran again).
	r.remove(name)

	r.logs.Publish(ctx, id, "Starting container "+name+"...")
	if _, err := r.run(ctx, args...); err != nil {
		// A failed start can still leave a created container behind.
		r.remove(name)
		return runtime.Release{}, fmt.Errorf("could not start the container: %w", err)
	}
	live := false
	defer func() {
		if !live {
			r.remove(name)
		}
	}()

	addr, err := r.hostAddr(ctx, name, spec.Port)
	if err != nil {
		return runtime.Release{}, err
	}

	r.logs.Publish(ctx, id, fmt.Sprintf("Waiting for GET %s on %s to succeed...", healthPath, addr))
	if err := r.waitHealthy(ctx, name, addr, healthPath, id, check); err != nil {
		return runtime.Release{}, err
	}
	if err := check(); err != nil {
		return runtime.Release{}, err
	}

	// From here the new container is the app; the previous ones are retired.
	live = true
	r.retireOthers(ctx, sub, name)

	url := r.publicURL(sub)
	r.logs.Publish(ctx, id, "Deployment live at: "+url)
	return runtime.Release{PublicURL: url, TaskDefinition: name, ServiceName: name}, nil
}

func (r *Runtime) waitHealthy(ctx context.Context, name, addr, path, deploymentID string, check func() error) error {
	deadline := time.Now().Add(r.healthTimeout)
	url := "http://" + addr + path
	var lastProblem string

	for attempt := 0; ; attempt++ {
		if err := check(); err != nil {
			return err
		}

		state, err := r.run(ctx, "inspect", "--format", "{{.State.Status}}", name)
		if err != nil {
			return fmt.Errorf("could not inspect the container: %w", err)
		}
		if status := strings.TrimSpace(state.Stdout); status != "running" {
			return fmt.Errorf("the container stopped (%s) before it answered the health check%s", status, r.logTail(ctx, name))
		}

		status, err := r.probe(ctx, url)
		switch {
		case err == nil && status >= 200 && status < 400:
			return nil
		case err != nil:
			lastProblem = "no answer"
		default:
			lastProblem = fmt.Sprintf("answered %d", status)
		}

		if time.Now().After(deadline) {
			return fmt.Errorf("the app did not pass its health check (GET %s: %s) within %s%s", path, lastProblem, r.healthTimeout, r.logTail(ctx, name))
		}
		if attempt > 0 && attempt%5 == 0 {
			r.logs.Publish(ctx, deploymentID, fmt.Sprintf("Still waiting for the app (%s)...", lastProblem))
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(r.healthInterval):
		}
	}
}

// Scale pauses (0) or resumes (any other number) the app's container. Pausing
// stops it; resuming starts the newest one again.
func (r *Runtime) Scale(ctx context.Context, app runtime.AppRef, replicas int32) error {
	containers, err := r.containers(ctx, app.Subdomain)
	if err != nil {
		return err
	}
	if len(containers) == 0 {
		return fmt.Errorf("no container found for %s", app.Subdomain)
	}
	if replicas == 0 {
		for _, c := range containers {
			if c.running {
				if _, err := r.run(ctx, "stop", c.name); err != nil {
					return err
				}
			}
		}
		return nil
	}
	if containers[0].running {
		return nil
	}
	_, err = r.run(ctx, "start", containers[0].name)
	return err
}

// Destroy removes every container of the app.
func (r *Runtime) Destroy(ctx context.Context, app runtime.AppRef) error {
	containers, err := r.containers(ctx, app.Subdomain)
	if err != nil {
		return err
	}
	for _, c := range containers {
		if _, err := r.run(ctx, "rm", "--force", c.name); err != nil {
			return err
		}
	}
	return nil
}

// Resolve gives the host address the app's running container is published on.
// Of several running containers (a new version starting beside the old) it
// picks the oldest, which is the one still serving.
func (r *Runtime) Resolve(ctx context.Context, subdomain string) (string, error) {
	if !labelPattern.MatchString(subdomain) {
		return "", proxy.ErrNotFound
	}
	containers, err := r.containers(ctx, subdomain)
	if err != nil {
		return "", err
	}
	if len(containers) == 0 {
		return "", proxy.ErrNotFound
	}
	for i := len(containers) - 1; i >= 0; i-- {
		if c := containers[i]; c.running {
			return r.hostAddr(ctx, c.name, c.port)
		}
	}
	return "", proxy.ErrStopped
}

type container struct {
	name    string
	running bool
	port    int32
}

// containers lists the app's containers, newest first.
func (r *Runtime) containers(ctx context.Context, subdomain string) ([]container, error) {
	if !labelPattern.MatchString(subdomain) {
		return nil, fmt.Errorf("subdomain %q is not valid", subdomain)
	}
	out, err := r.run(ctx, "ps", "--all",
		"--filter", "label="+labelApp+"="+subdomain,
		"--filter", "label="+labelManaged+"=true",
		"--format", `{{.Names}}	{{.State}}	{{.Label "`+labelPort+`"}}`)
	if err != nil {
		return nil, err
	}
	var found []container
	for _, line := range strings.Split(strings.TrimSpace(out.Stdout), "\n") {
		if line == "" {
			continue
		}
		fields := strings.Split(line, "\t")
		if len(fields) != 3 {
			return nil, fmt.Errorf("unexpected docker ps output: %q", line)
		}
		// A label that is missing or not a port reads as 0.
		port, _ := strconv.ParseInt(fields[2], 10, 32)
		found = append(found, container{name: fields[0], running: fields[1] == "running", port: int32(port)})
	}
	return found, nil
}

// hostAddr is where Docker published the container's port on this host.
func (r *Runtime) hostAddr(ctx context.Context, name string, port int32) (string, error) {
	out, err := r.run(ctx, "port", name, fmt.Sprintf("%d/tcp", port))
	if err != nil {
		return "", fmt.Errorf("could not find the container's port: %w", err)
	}
	line, _, _ := strings.Cut(strings.TrimSpace(out.Stdout), "\n")
	host, hostPort, err := net.SplitHostPort(strings.TrimSpace(line))
	if err != nil || hostPort == "" {
		return "", fmt.Errorf("container %s has no published port %d (docker said %q)", name, port, strings.TrimSpace(out.Stdout))
	}
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	return net.JoinHostPort(host, hostPort), nil
}

func (r *Runtime) ensureNetwork(ctx context.Context) error {
	if _, err := r.run(ctx, "network", "inspect", networkName); err == nil {
		return nil
	}
	if _, err := r.run(ctx, "network", "create", "--label", labelManaged+"=true", networkName); err != nil {
		// Another deploy may have created it between the two commands.
		if _, inspectErr := r.run(ctx, "network", "inspect", networkName); inspectErr == nil {
			return nil
		}
		return fmt.Errorf("could not create the Docker network: %w", err)
	}
	return nil
}

// retireOthers removes the app's containers other than keep.
func (r *Runtime) retireOthers(ctx context.Context, subdomain, keep string) {
	containers, err := r.containers(context.WithoutCancel(ctx), subdomain)
	if err != nil {
		slog.Warn("could not list the previous containers", "subdomain", subdomain, "error", err)
		return
	}
	for _, c := range containers {
		if c.name != keep {
			r.remove(c.name)
		}
	}
}

// remove deletes a container, whatever state the caller's context is in.
func (r *Runtime) remove(name string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := r.run(ctx, "rm", "--force", name); err != nil && !strings.Contains(err.Error(), "No such container") {
		slog.Warn("could not remove a container", "container", name, "error", err)
	}
}

// logTail is the end of the container's output, for an error message.
func (r *Runtime) logTail(ctx context.Context, name string) string {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	out, err := r.run(ctx, "logs", "--tail", "20", name)
	text := strings.TrimSpace(out.Stdout + "\n" + out.Stderr)
	if err != nil || text == "" {
		return ""
	}
	return "\nLast output of the app:\n" + text
}

func validate(spec runtime.DeploySpec) error {
	switch {
	case strings.TrimSpace(spec.DeploymentID) == "":
		return errors.New("deployment id is required")
	case !labelPattern.MatchString(spec.Subdomain):
		return fmt.Errorf("subdomain %q is not a valid DNS label", spec.Subdomain)
	case strings.TrimSpace(spec.ImageURI) == "" || strings.HasPrefix(spec.ImageURI, "-"):
		return errors.New("image is required")
	case spec.Port <= 0 || spec.Port > 65535:
		return errors.New("port must be between 1 and 65535")
	case spec.CPU <= 0 || spec.MemoryMB <= 0:
		return errors.New("cpu and memory must be greater than zero")
	case spec.HealthCheck != "" && (!strings.HasPrefix(spec.HealthCheck, "/") || len(spec.HealthCheck) > 1024 || strings.ContainsAny(spec.HealthCheck, "\x00 \r\n")):
		return errors.New("health check must be a path starting with /")
	}
	return nil
}

// shortID is the first 12 characters of a deployment id, as Docker shortens its
// own ids.
func shortID(id string) string {
	id = strings.ReplaceAll(id, "-", "")
	if len(id) > 12 {
		return id[:12]
	}
	return id
}

func httpProbe(ctx context.Context, url string) (int, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	_ = resp.Body.Close()
	return resp.StatusCode, nil
}
