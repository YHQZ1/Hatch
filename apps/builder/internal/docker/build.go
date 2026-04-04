package docker

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strings"

	"github.com/YHQZ1/hatch/apps/builder/internal/logs"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ecr"
)

type Builder struct {
	ecrRegistry string
	ecrRepo     string
	awsRegion   string
	streamer    *logs.Streamer
}

func NewBuilder(ecrRegistry, ecrRepo, awsRegion string, streamer *logs.Streamer) *Builder {
	return &Builder{
		ecrRegistry: ecrRegistry,
		ecrRepo:     ecrRepo,
		awsRegion:   awsRegion,
		streamer:    streamer,
	}
}

func (b *Builder) BuildAndPush(ctx context.Context, deploymentID, repoDir string) (string, error) {
	imageTag := fmt.Sprintf("%s/%s:%s", b.ecrRegistry, b.ecrRepo, deploymentID[:8])

	// docker build
	b.streamer.Publish(ctx, deploymentID, "→ Building Docker image...")
	if err := b.runDockerBuild(ctx, deploymentID, repoDir, imageTag); err != nil {
		return "", fmt.Errorf("docker build failed: %w", err)
	}

	// authenticate to ECR
	b.streamer.Publish(ctx, deploymentID, "→ Authenticating with AWS ECR...")
	authToken, err := b.getECRAuthToken(ctx)
	if err != nil {
		return "", fmt.Errorf("ecr auth failed: %w", err)
	}

	// docker push
	b.streamer.Publish(ctx, deploymentID, "→ Pushing image to ECR...")
	if err := b.runDockerPush(ctx, deploymentID, imageTag, authToken); err != nil {
		return "", fmt.Errorf("docker push failed: %w", err)
	}

	b.streamer.Publish(ctx, deploymentID, fmt.Sprintf("✓ Image pushed: %s", imageTag))
	return imageTag, nil
}

func (b *Builder) runDockerBuild(ctx context.Context, deploymentID, repoDir, imageTag string) error {
	cmd := exec.CommandContext(ctx, "docker", "build", "-t", imageTag, repoDir)
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		return err
	}

	// stream stdout
	go b.streamOutput(ctx, deploymentID, stdout)
	go b.streamOutput(ctx, deploymentID, stderr)

	return cmd.Wait()
}

func (b *Builder) streamOutput(ctx context.Context, deploymentID string, r io.Reader) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := scanner.Text()
		if line != "" {
			b.streamer.Publish(ctx, deploymentID, line)
		}
	}
}

func (b *Builder) getECRAuthToken(ctx context.Context) (string, error) {
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(b.awsRegion))
	if err != nil {
		return "", err
	}

	client := ecr.NewFromConfig(cfg)
	output, err := client.GetAuthorizationToken(ctx, &ecr.GetAuthorizationTokenInput{})
	if err != nil {
		return "", err
	}

	if len(output.AuthorizationData) == 0 {
		return "", fmt.Errorf("no authorization data returned")
	}

	return *output.AuthorizationData[0].AuthorizationToken, nil
}

func (b *Builder) runDockerPush(ctx context.Context, deploymentID, imageTag, authToken string) error {
	// decode base64 token → user:password
	decoded, err := base64.StdEncoding.DecodeString(authToken)
	if err != nil {
		return err
	}
	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) != 2 {
		return fmt.Errorf("invalid auth token format")
	}

	// docker login
	loginCmd := exec.CommandContext(ctx, "docker", "login",
		"--username", parts[0],
		"--password-stdin",
		b.ecrRegistry,
	)
	loginCmd.Stdin = strings.NewReader(parts[1])
	if out, err := loginCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("docker login failed: %s", string(out))
	}

	// docker push
	pushCmd := exec.CommandContext(ctx, "docker", "push", imageTag)
	stdout, _ := pushCmd.StdoutPipe()
	stderr, _ := pushCmd.StderrPipe()

	if err := pushCmd.Start(); err != nil {
		return err
	}

	go b.streamOutput(ctx, deploymentID, stdout)
	go b.streamOutput(ctx, deploymentID, stderr)

	return pushCmd.Wait()
}

// JSONMessage is used to parse docker build output
type JSONMessage struct {
	Stream string `json:"stream"`
	Error  string `json:"error"`
}

func parseDockerOutput(line string) string {
	var msg JSONMessage
	if err := json.Unmarshal([]byte(line), &msg); err != nil {
		return line
	}
	if msg.Error != "" {
		return "✗ " + msg.Error
	}
	return strings.TrimRight(msg.Stream, "\n")
}
