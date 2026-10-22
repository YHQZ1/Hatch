package docker

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/YHQZ1/hatch/internal/build"
	gitpkg "github.com/YHQZ1/hatch/internal/build/git"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ecr"
	ecrtypes "github.com/aws/aws-sdk-go-v2/service/ecr/types"
)

var _ build.Builder = (*Builder)(nil)

// Build clones the repository, builds it with Docker, and pushes the image.
// Nothing it creates outlives the call except the pushed image.
func (b *Builder) Build(ctx context.Context, spec build.Spec) (build.Image, error) {
	id := spec.DeploymentID
	dir := filepath.Join(os.TempDir(), "hatch-builds", safePathSegment(id))
	defer os.RemoveAll(dir)

	b.streamer.Publish(ctx, id, "Syncing source code...")
	if err := gitpkg.Clone(ctx, spec.RepoURL, spec.CloneToken, spec.Branch, dir); err != nil {
		if errors.Is(err, context.Canceled) {
			b.streamer.Publish(context.Background(), id, "Build canceled during source sync")
			return build.Image{}, fmt.Errorf("%w: %w", build.ErrCanceled, err)
		}
		b.streamer.Publish(ctx, id, fmt.Sprintf("Sync failed: %v", err))
		return build.Image{}, &build.Error{Stage: build.StageSource, Err: err}
	}
	if errors.Is(ctx.Err(), context.Canceled) {
		b.streamer.Publish(context.Background(), id, "Deployment canceled before Docker build")
		return build.Image{}, build.ErrCanceled
	}

	uri, err := b.buildAndPush(ctx, id, dir, spec.DockerfilePath)
	if err != nil {
		if errors.Is(err, build.ErrCanceled) {
			b.publishCancellation(context.Background(), id, err)
			return build.Image{}, err
		}
		b.streamer.Publish(ctx, id, fmt.Sprintf("Build failed: %v", err))
		return build.Image{}, &build.Error{Stage: build.StageBuild, Err: err}
	}
	return build.Image{URI: uri}, nil
}

// DeleteImages removes the images from ECR. Images that are already gone are
// not an error.
func (b *Builder) DeleteImages(ctx context.Context, images []build.Image) error {
	byRepository := map[string][]ecrtypes.ImageIdentifier{}
	for _, image := range images {
		ref, ok := parseECRImageURI(image.URI)
		if !ok {
			continue
		}
		byRepository[ref.repository] = append(byRepository[ref.repository], ecrtypes.ImageIdentifier{
			ImageTag: aws.String(ref.tag),
		})
	}
	if len(byRepository) == 0 {
		return nil
	}

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(b.region))
	if err != nil {
		return fmt.Errorf("failed to load AWS config: %w", err)
	}
	client := ecr.NewFromConfig(cfg)
	for repository, ids := range byRepository {
		out, err := client.BatchDeleteImage(ctx, &ecr.BatchDeleteImageInput{
			RepositoryName: aws.String(repository),
			ImageIds:       ids,
		})
		if err != nil {
			return fmt.Errorf("failed to delete ECR images from %s: %w", repository, err)
		}
		if err := checkECRDeleteFailures(repository, out.Failures); err != nil {
			return err
		}
	}
	return nil
}

func (b *Builder) publishCancellation(ctx context.Context, id string, err error) {
	message := "Build canceled before image handoff"
	var canceledErr *CanceledError
	if errors.As(err, &canceledErr) {
		switch canceledErr.Stage() {
		case CancelStageBeforeDockerBuild:
			message = "Deployment canceled before Docker build"
		case CancelStageDuringDockerBuild:
			message = "Build canceled during Docker build"
		case CancelStageBeforeECRAuth:
			message = "Cancellation detected before ECR authentication"
		case CancelStageDuringECRAuth:
			message = "Build canceled during ECR authentication"
		case CancelStageBeforeDockerPush:
			message = "Cancellation detected before docker push"
		case CancelStageDuringDockerPush:
			message = "Build canceled during docker push"
		case CancelStageAfterDockerPush:
			message = "Build canceled after image push; skipping deploy handoff"
		}
	}
	b.streamer.Publish(ctx, id, message)
}

type ecrRef struct {
	repository string
	tag        string
}

func parseECRImageURI(imageURI string) (ecrRef, bool) {
	var ref ecrRef
	parts := strings.SplitN(strings.TrimSpace(imageURI), "/", 2)
	if len(parts) != 2 || parts[1] == "" {
		return ref, false
	}
	repositoryAndTag := parts[1]
	tagIndex := strings.LastIndex(repositoryAndTag, ":")
	if tagIndex <= 0 || tagIndex == len(repositoryAndTag)-1 {
		return ref, false
	}
	ref.repository = repositoryAndTag[:tagIndex]
	ref.tag = repositoryAndTag[tagIndex+1:]
	return ref, true
}

func checkECRDeleteFailures(repository string, failures []ecrtypes.ImageFailure) error {
	for _, failure := range failures {
		code := string(failure.FailureCode)
		if code == "" || strings.EqualFold(code, "ImageNotFound") {
			continue
		}
		reason := ""
		if failure.FailureReason != nil {
			reason = *failure.FailureReason
		}
		return fmt.Errorf("failed to delete ECR image from %s: %s %s", repository, code, strings.TrimSpace(reason))
	}
	return nil
}

func safePathSegment(value string) string {
	cleaned := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			return r
		case r == '-', r == '_', r == '.':
			return r
		default:
			return '-'
		}
	}, strings.TrimSpace(value))
	cleaned = strings.Trim(cleaned, ".-")
	if cleaned == "" {
		return fmt.Sprintf("deployment-%d", time.Now().UnixNano())
	}
	return cleaned
}
