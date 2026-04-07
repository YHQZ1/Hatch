package docker

import (
	"bufio"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"os/exec"
	"strings"

	"github.com/YHQZ1/hatch/apps/builder/internal/logs"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ecr"
)

type Builder struct {
	registry string
	repo     string
	region   string
	streamer *logs.Streamer
}

func NewBuilder(registry, repo, region string, streamer *logs.Streamer) *Builder {
	return &Builder{
		registry: registry,
		repo:     repo,
		region:   region,
		streamer: streamer,
	}
}

func (b *Builder) BuildAndPush(ctx context.Context, id, repoDir, dockerfilePath string) (string, error) {
	tag := fmt.Sprintf("%s/%s:%s", b.registry, b.repo, id[:8])

	b.streamer.Publish(ctx, id, "→ Starting Docker build...")
	if err := b.runBuild(ctx, id, repoDir, dockerfilePath, tag); err != nil {
		return "", fmt.Errorf("docker build error: %w", err)
	}

	b.streamer.Publish(ctx, id, "→ Authenticating with Amazon ECR...")
	token, err := b.getAuthToken(ctx)
	if err != nil {
		return "", fmt.Errorf("ecr login failed: %w", err)
	}

	b.streamer.Publish(ctx, id, "→ Pushing image to registry...")
	if err := b.runPush(ctx, id, tag, token); err != nil {
		return "", fmt.Errorf("push failed: %w", err)
	}

	b.streamer.Publish(ctx, id, fmt.Sprintf("✓ Image successfully pushed: %s", tag))
	b.streamer.Publish(ctx, id, "→ Handoff to Deployer: Provisioning Cloud Infrastructure...")
	return tag, nil
}

func (b *Builder) runBuild(ctx context.Context, id, repoDir, dockerfilePath, tag string) error {
	lastSlash := strings.LastIndex(dockerfilePath, "/")
	contextDir := repoDir
	dockerfileBase := dockerfilePath

	if lastSlash != -1 {
		contextDir = fmt.Sprintf("%s/%s", repoDir, dockerfilePath[:lastSlash])
		dockerfileBase = dockerfilePath[lastSlash+1:]
	}

	cmd := exec.CommandContext(ctx, "docker", "build",
		"--platform", "linux/amd64",
		"-t", tag,
		"-f", dockerfileBase,
		".",
	)
	cmd.Dir = contextDir

	return b.executeAndStream(ctx, id, cmd)
}

func (b *Builder) runPush(ctx context.Context, id, tag, token string) error {
	decoded, _ := base64.StdEncoding.DecodeString(token)
	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) != 2 {
		return fmt.Errorf("malformed ecr token")
	}

	loginCmd := exec.CommandContext(ctx, "docker", "login",
		"--username", parts[0],
		"--password-stdin",
		b.registry,
	)
	loginCmd.Stdin = strings.NewReader(parts[1])
	if out, err := loginCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("docker login failed: %s", string(out))
	}

	pushCmd := exec.CommandContext(ctx, "docker", "push", tag)
	return b.executeAndStream(ctx, id, pushCmd)
}

func (b *Builder) executeAndStream(ctx context.Context, id string, cmd *exec.Cmd) error {
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		return err
	}

	go b.capture(ctx, id, stdout)
	go b.capture(ctx, id, stderr)

	return cmd.Wait()
}

func (b *Builder) capture(ctx context.Context, id string, r io.Reader) {
	scanner := bufio.NewScanner(r)
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
		return "", err
	}

	client := ecr.NewFromConfig(cfg)
	out, err := client.GetAuthorizationToken(ctx, &ecr.GetAuthorizationTokenInput{})
	if err != nil || len(out.AuthorizationData) == 0 {
		return "", fmt.Errorf("no authorization data returned from ecr")
	}

	return *out.AuthorizationData[0].AuthorizationToken, nil
}
