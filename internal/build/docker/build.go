package docker

import (
	"bufio"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/YHQZ1/hatch/internal/build"
	"github.com/YHQZ1/hatch/internal/stream"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ecr"
)

// ErrCanceled is build.ErrCanceled: errors from this package match either.
var ErrCanceled = build.ErrCanceled

const maxLogLineBytes = 1024 * 1024

var imageTagReplacer = regexp.MustCompile(`[^A-Za-z0-9_.-]+`)

type CancelStage string

const (
	CancelStageBeforeDockerBuild CancelStage = "before_docker_build"
	CancelStageDuringDockerBuild CancelStage = "during_docker_build"
	CancelStageBeforeECRAuth     CancelStage = "before_ecr_auth"
	CancelStageDuringECRAuth     CancelStage = "during_ecr_auth"
	CancelStageBeforeDockerPush  CancelStage = "before_docker_push"
	CancelStageDuringDockerPush  CancelStage = "during_docker_push"
	CancelStageAfterDockerPush   CancelStage = "after_docker_push"
)

type CanceledError struct {
	stage CancelStage
}

func (e *CanceledError) Error() string {
	return fmt.Sprintf("build canceled at stage: %s", e.stage)
}

func (e *CanceledError) Is(target error) bool {
	return target == ErrCanceled
}

func (e *CanceledError) Stage() CancelStage {
	return e.stage
}

// Builder builds images with the Docker CLI on this host and pushes them to an
// ECR repository. It implements build.Builder.
type Builder struct {
	registry string
	repo     string
	region   string
	streamer stream.Sink
	// local builds for this host's Docker only: no registry, no push, and the
	// host's own platform.
	local bool
}

// localRepository names the images the local builder leaves in Docker.
const localRepository = "hatch-local"

// NewLocalBuilder returns a Builder for the local target. It builds with the
// host's Docker and leaves the image there as hatch-local:<deployment id>.
func NewLocalBuilder(sink stream.Sink) *Builder {
	return &Builder{repo: localRepository, streamer: sink, local: true}
}

func NewBuilder(registry, repo, region string, sink stream.Sink) *Builder {
	return &Builder{
		registry: registry,
		repo:     repo,
		region:   region,
		streamer: sink,
	}
}

func (b *Builder) buildAndPush(ctx context.Context, id, repoDir, dockerfilePath string) (string, error) {
	imageTag := imageTag(id)
	tag := fmt.Sprintf("%s/%s:%s", b.registry, b.repo, imageTag)
	if b.local {
		tag = fmt.Sprintf("%s:%s", b.repo, imageTag)
	}

	if err := ensureActive(ctx, CancelStageBeforeDockerBuild); err != nil {
		return "", err
	}

	b.streamer.Publish(ctx, id, "Starting Docker build...")
	if err := b.runBuild(ctx, id, repoDir, dockerfilePath, tag); err != nil {
		if errors.Is(err, context.Canceled) {
			return "", canceled(CancelStageDuringDockerBuild)
		}
		return "", fmt.Errorf("docker build failed: %w", err)
	}

	if b.local {
		if err := ensureActive(ctx, CancelStageAfterDockerPush); err != nil {
			return "", err
		}
		b.streamer.Publish(ctx, id, fmt.Sprintf("Image built: %s", tag))
		return tag, nil
	}

	if err := ensureActive(ctx, CancelStageBeforeECRAuth); err != nil {
		return "", err
	}

	b.streamer.Publish(ctx, id, "Authenticating with Amazon ECR...")
	token, err := b.getAuthToken(ctx)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return "", canceled(CancelStageDuringECRAuth)
		}
		return "", fmt.Errorf("ECR authentication failed: %w", err)
	}

	if err := ensureActive(ctx, CancelStageBeforeDockerPush); err != nil {
		return "", err
	}

	b.streamer.Publish(ctx, id, "Pushing image to registry...")
	if err := b.runPush(ctx, id, tag, token); err != nil {
		if errors.Is(err, context.Canceled) {
			return "", canceled(CancelStageDuringDockerPush)
		}
		return "", fmt.Errorf("docker push failed: %w", err)
	}

	if err := ensureActive(ctx, CancelStageAfterDockerPush); err != nil {
		return "", err
	}

	b.streamer.Publish(ctx, id, fmt.Sprintf("Image successfully pushed: %s", tag))
	return tag, nil
}

func (b *Builder) runBuild(ctx context.Context, id, repoDir, dockerfilePath, tag string) error {
	contextDir, dockerfileBase, err := buildContext(repoDir, dockerfilePath)
	if err != nil {
		return err
	}

	args := []string{"build"}
	if !b.local {
		// ECS Fargate runs amd64; the local target runs on the host's platform.
		args = append(args, "--platform", "linux/amd64")
	}
	args = append(args, "-t", tag, "-f", dockerfileBase, ".")
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Dir = contextDir
	cmd.Env = append(os.Environ(), "DOCKER_BUILDKIT=1")

	return b.executeAndStream(ctx, id, cmd)
}

func (b *Builder) runPush(ctx context.Context, id, tag, token string) error {
	if err := ensureActive(ctx, CancelStageBeforeDockerPush); err != nil {
		return err
	}

	decoded, err := base64.StdEncoding.DecodeString(token)
	if err != nil {
		return fmt.Errorf("failed to decode ECR token: %w", err)
	}

	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) != 2 {
		return fmt.Errorf("malformed ECR token")
	}

	loginCmd := exec.CommandContext(ctx, "docker", "login",
		"--username", parts[0],
		"--password-stdin",
		b.registry,
	)
	loginCmd.Stdin = strings.NewReader(parts[1])
	if out, err := loginCmd.CombinedOutput(); err != nil {
		if errors.Is(ctx.Err(), context.Canceled) {
			return canceled(CancelStageBeforeDockerPush)
		}
		return fmt.Errorf("docker login failed: %s", string(out))
	}

	if err := ensureActive(ctx, CancelStageBeforeDockerPush); err != nil {
		return err
	}

	pushCmd := exec.CommandContext(ctx, "docker", "push", tag)
	return b.executeAndStream(ctx, id, pushCmd)
}

func (b *Builder) executeAndStream(ctx context.Context, id string, cmd *exec.Cmd) error {
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	ownProcessGroup(cmd)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start command: %w", err)
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		b.capture(ctx, id, stdout)
	}()
	go func() {
		defer wg.Done()
		b.capture(ctx, id, stderr)
	}()

	waitErr := cmd.Wait()
	wg.Wait()

	if waitErr != nil {
		return waitErr
	}
	return nil
}

func (b *Builder) capture(ctx context.Context, id string, r io.Reader) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), maxLogLineBytes)
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return
		default:
			if line := scanner.Text(); line != "" {
				b.streamer.Publish(ctx, id, line)
			}
		}
	}
}

func (b *Builder) getAuthToken(ctx context.Context) (string, error) {
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(b.region))
	if err != nil {
		return "", fmt.Errorf("failed to load AWS config: %w", err)
	}

	client := ecr.NewFromConfig(cfg)
	out, err := client.GetAuthorizationToken(ctx, &ecr.GetAuthorizationTokenInput{})
	if err != nil {
		return "", fmt.Errorf("failed to get ECR auth token: %w", err)
	}

	if len(out.AuthorizationData) == 0 {
		return "", fmt.Errorf("no authorization data returned from ECR")
	}

	return *out.AuthorizationData[0].AuthorizationToken, nil
}

func ensureActive(ctx context.Context, stage CancelStage) error {
	if errors.Is(ctx.Err(), context.Canceled) {
		return canceled(stage)
	}

	return nil
}

func canceled(stage CancelStage) error {
	return &CanceledError{stage: stage}
}

func buildContext(repoDir, dockerfilePath string) (string, string, error) {
	cleanPath, err := cleanDockerfilePath(dockerfilePath)
	if err != nil {
		return "", "", err
	}

	contextDir := repoDir
	dockerfileBase := cleanPath
	if dir := filepath.Dir(cleanPath); dir != "." {
		contextDir = filepath.Join(repoDir, dir)
		dockerfileBase = filepath.Base(cleanPath)
	}

	absRepo, err := filepath.Abs(repoDir)
	if err != nil {
		return "", "", fmt.Errorf("failed to resolve repo path: %w", err)
	}
	absContext, err := filepath.Abs(contextDir)
	if err != nil {
		return "", "", fmt.Errorf("failed to resolve build context: %w", err)
	}
	rel, err := filepath.Rel(absRepo, absContext)
	if err != nil {
		return "", "", fmt.Errorf("failed to validate build context: %w", err)
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", "", fmt.Errorf("dockerfile path escapes repository")
	}
	if _, err := os.Stat(filepath.Join(absContext, dockerfileBase)); err != nil {
		if os.IsNotExist(err) {
			return "", "", fmt.Errorf("dockerfile not found: %s", cleanPath)
		}
		return "", "", fmt.Errorf("failed to inspect dockerfile: %w", err)
	}

	return absContext, dockerfileBase, nil
}

func cleanDockerfilePath(dockerfilePath string) (string, error) {
	path := strings.TrimSpace(strings.ReplaceAll(dockerfilePath, "\\", "/"))
	if path == "" {
		path = "Dockerfile"
	}
	if strings.HasPrefix(path, "/") {
		return "", fmt.Errorf("dockerfile path must be relative")
	}
	clean := filepath.Clean(filepath.FromSlash(path))
	if clean == "." || clean == string(filepath.Separator) {
		return "", fmt.Errorf("dockerfile path is invalid")
	}
	for _, part := range strings.Split(clean, string(filepath.Separator)) {
		if part == ".." {
			return "", fmt.Errorf("dockerfile path cannot contain '..'")
		}
	}
	return clean, nil
}

func imageTag(id string) string {
	tag := strings.Trim(imageTagReplacer.ReplaceAllString(strings.TrimSpace(id), "-"), ".-")
	if tag == "" {
		return "deployment"
	}
	if len(tag) > 128 {
		return tag[:128]
	}
	return tag
}
