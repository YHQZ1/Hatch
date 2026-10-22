package jobs

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"

	"github.com/YHQZ1/hatch/internal/build"
	"github.com/YHQZ1/hatch/internal/githubapp"
)

type buildWorker struct {
	river.WorkerDefaults[BuildArgs]
	deps Deps
	records
}

func newBuildWorker(deps Deps) *buildWorker {
	return &buildWorker{deps: deps, records: newRecords(deps.Pool, deps.Logs)}
}

func (w *buildWorker) Timeout(*river.Job[BuildArgs]) time.Duration {
	return w.deps.BuildTimeout + time.Minute
}

// Work builds the deployment's image and enqueues the deploy job. Every
// failure that retrying cannot fix is recorded on the deployment and ends the
// job; only a stop of Hatch itself returns an error, so that the job runs again.
func (w *buildWorker) Work(ctx context.Context, job *river.Job[BuildArgs]) error {
	args := job.Args
	id := args.DeploymentID
	idText := id.String()

	if err := args.Validate(); err != nil {
		w.logs.Publish(ctx, idText, fmt.Sprintf("Build job rejected: %v", err))
		w.failDeployment(ctx, id, "builder_validation", err)
		return river.JobCancel(err)
	}

	runCtx, cancelTimeout := context.WithTimeout(ctx, w.deps.BuildTimeout)
	defer cancelTimeout()
	runCtx, cancel := context.WithCancel(runCtx)
	defer cancel()
	defer w.watchCancellation(runCtx, id, cancel)()

	w.logs.Publish(ctx, idText, "Job received: "+shortID(id))
	w.setDeploymentStatus(context.Background(), id, "building")

	if w.isCanceled(context.Background(), id) {
		w.logs.Publish(ctx, idText, "Deployment canceled before source sync")
		return nil
	}

	token, err := w.cloneToken(runCtx, args.RepoURL)
	if err != nil {
		w.logs.Publish(ctx, idText, fmt.Sprintf("Auth failed: %v", err))
		w.failDeployment(context.Background(), id, "auth", err)
		return river.JobCancel(err)
	}

	image, err := w.deps.Builder.Build(runCtx, build.Spec{
		DeploymentID:   idText,
		RepoURL:        args.RepoURL,
		Branch:         args.Branch,
		DockerfilePath: args.DockerfilePath,
		CloneToken:     token,
	})
	if err != nil {
		return w.buildFailed(ctx, runCtx, args, err)
	}

	if w.isCanceled(context.Background(), id) {
		w.logs.Publish(ctx, idText, "Deployment canceled before deploy handoff")
		if err := w.deps.Builder.DeleteImages(context.Background(), []build.Image{image}); err != nil {
			slog.Warn("failed to delete the image of a canceled build", "deployment_id", id, "image", image.URI, "error", err)
		}
		return nil
	}

	w.logs.Publish(ctx, idText, "Triggering deployment orchestration...")
	if err := w.handoff(ctx, job, image); err != nil {
		if outcomeOf(ctx, runCtx) == outcomeShutdown {
			return err
		}
		w.logs.Publish(ctx, idText, fmt.Sprintf("Hand off to deployer failed: %v", err))
		w.failDeployment(context.Background(), id, "handoff", err)
		return river.JobCancel(err)
	}
	w.logs.Publish(ctx, idText, "Pipeline stage complete: Build and Push")
	return nil
}

// buildFailed decides what a failed build means: the deployment was canceled,
// time ran out, Hatch is stopping, or the build itself failed.
func (w *buildWorker) buildFailed(parent, run context.Context, args BuildArgs, err error) error {
	id := args.DeploymentID
	idText := id.String()

	if w.isCanceled(context.Background(), id) {
		return nil
	}
	switch outcomeOf(parent, run) {
	case outcomeTimedOut:
		timeout := fmt.Errorf("build exceeded timeout of %s", w.deps.BuildTimeout)
		w.logs.Publish(context.Background(), idText, "Build timed out")
		w.failDeployment(context.Background(), id, "timeout", timeout)
		return river.JobCancel(timeout)
	case outcomeShutdown:
		return err
	}

	stage := string(build.StageBuild)
	var buildErr *build.Error
	if errors.As(err, &buildErr) {
		stage = string(buildErr.Stage)
	}
	w.failDeployment(context.Background(), id, stage, err)
	return river.JobCancel(err)
}

// handoff enqueues the deploy job and completes this one in a single
// transaction, so a crash leaves either both done or neither.
func (w *buildWorker) handoff(ctx context.Context, job *river.Job[BuildArgs], image build.Image) error {
	tx, err := w.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	args := job.Args
	client := river.ClientFromContext[pgx.Tx](ctx)
	if _, err := client.InsertTx(ctx, tx, DeployArgs{
		DeploymentID: args.DeploymentID,
		ImageURI:     image.URI,
		Subdomain:    args.Subdomain,
		Port:         args.Port,
		CPU:          args.CPU,
		MemoryMB:     args.MemoryMB,
		HealthCheck:  args.HealthCheck,
	}, nil); err != nil {
		return fmt.Errorf("enqueue the deploy job: %w", err)
	}
	if _, err := river.JobCompleteTx[*riverpgxv5.Driver](ctx, tx, job); err != nil {
		return fmt.Errorf("complete the build job: %w", err)
	}
	return tx.Commit(ctx)
}

// cloneToken returns a short-lived token that can read only the job's
// repository. It comes from the Hatch GitHub App's installation, so a build
// never holds the user's own GitHub credentials (ADR 0010).
func (w *buildWorker) cloneToken(ctx context.Context, repoURL string) (string, error) {
	owner, name, err := githubapp.ParseRepoURL(repoURL)
	if err != nil {
		return "", err
	}
	token, err := w.deps.CloneTokens.InstallationToken(ctx, owner, name)
	if errors.Is(err, githubapp.ErrNotInstalled) {
		return "", fmt.Errorf("the Hatch GitHub App is not installed on %s/%s; install it on the repository and deploy again", owner, name)
	}
	if err != nil {
		return "", fmt.Errorf("could not get access to %s/%s: %w", owner, name, err)
	}
	return strings.TrimSpace(token), nil
}
