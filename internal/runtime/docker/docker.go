// Package docker is the local target's runtime: each app is a container on this
// host's Docker, reached through the built-in proxy (ADR 0018). It drives the
// docker command line, the same way the local builder does.
package docker

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strings"
)

// Output is what a docker command printed.
type Output struct {
	Stdout string
	Stderr string
}

// Command runs the docker command line with args. It exists so tests can
// script docker.
type Command func(ctx context.Context, args ...string) (Output, error)

// Exec runs the docker found on PATH.
func Exec(ctx context.Context, args ...string) (Output, error) {
	var stdout, stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	out := Output{Stdout: stdout.String(), Stderr: stderr.String()}
	if err == nil {
		return out, nil
	}
	if errors.Is(err, exec.ErrNotFound) {
		return out, errors.New("docker is not installed or not on PATH")
	}
	if ctx.Err() != nil {
		return out, ctx.Err()
	}
	message := strings.TrimSpace(out.Stderr)
	if message == "" {
		message = err.Error()
	}
	return out, fmt.Errorf("docker %s: %s", args[0], message)
}

// Available reports why Docker cannot be used, or nil when it answers.
func Available(ctx context.Context, run Command) error {
	if _, err := run(ctx, "info", "--format", "{{.ServerVersion}}"); err != nil {
		return fmt.Errorf("the local target needs Docker running: %w", err)
	}
	return nil
}

var labelPattern = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

// writeEnvFile writes env in the format of docker run --env-file and returns
// its path. A file keeps secrets out of the process list, and out of the
// environment of the docker command, where a variable such as DOCKER_HOST would
// change what it talks to.
func writeEnvFile(env map[string]string) (string, error) {
	var b strings.Builder
	for key, value := range env {
		if key == "" || strings.ContainsAny(key, "=\r\n\x00") {
			return "", fmt.Errorf("environment variable name %q is not valid", key)
		}
		if strings.ContainsAny(value, "\r\n\x00") {
			return "", fmt.Errorf("environment variable %s contains a line break, which the local target cannot pass to Docker", key)
		}
		b.WriteString(key + "=" + value + "\n")
	}
	f, err := os.CreateTemp("", "hatch-env-*")
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := f.WriteString(b.String()); err != nil {
		_ = os.Remove(f.Name())
		return "", err
	}
	return f.Name(), nil
}
