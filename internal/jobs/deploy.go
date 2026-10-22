package jobs

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/riverqueue/river"

	"github.com/YHQZ1/hatch/internal/build"
	"github.com/YHQZ1/hatch/internal/runtime"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
)

type deployWorker struct {
	river.WorkerDefaults[DeployArgs]
	deps Deps
	records
}

func newDeployWorker(deps Deps) *deployWorker {
	return &deployWorker{deps: deps, records: newRecords(deps.Pool, deps.Logs)}
}

func (w *deployWorker) Timeout(*river.Job[DeployArgs]) time.Duration {
	return deployTimeout + time.Minute
}

// Work runs the built image and marks the deployment live.
func (w *deployWorker) Work(ctx context.Context, job *river.Job[DeployArgs]) error {
	args := job.Args
	id := args.DeploymentID
	idText := id.String()

	if err := args.Validate(); err != nil {
		w.logs.Publish(ctx, idText, fmt.Sprintf("Deploy job rejected: %v", err))
		w.failDeployment(ctx, id, "deployer_validation", err)
		return river.JobCancel(err)
	}

	runCtx, cancel := context.WithTimeout(ctx, deployTimeout)
	defer cancel()

	if w.isCanceled(runCtx, id) {
		w.logs.Publish(runCtx, idText, "Deployment canceled before provisioning")
		return nil
	}
	w.setDeploymentStatus(runCtx, id, "deploying")

	env, err := w.envVars(runCtx, id)
	if err != nil {
		w.logs.Publish(runCtx, idText, fmt.Sprintf("Environment load failed: %v", err))
		w.failDeployment(runCtx, id, "env", err)
		return river.JobCancel(err)
	}

	release, err := w.deps.Runtime.Deploy(runCtx, runtime.DeploySpec{
		DeploymentID: idText,
		ImageURI:     args.ImageURI,
		Subdomain:    args.Subdomain,
		Port:         args.Port,
		CPU:          args.CPU,
		MemoryMB:     args.MemoryMB,
		HealthCheck:  args.HealthCheck,
		EnvVars:      env,
	}, func(ctx context.Context) (bool, error) { return w.deploymentCanceled(ctx, id) })
	if err != nil {
		return w.deployFailed(ctx, runCtx, args, err)
	}

	if w.isCanceled(runCtx, id) {
		w.logs.Publish(runCtx, idText, "Deployment canceled before finalization")
		w.discard(runCtx, args)
		w.setDeploymentStatus(runCtx, id, "canceled")
		return nil
	}
	w.finish(runCtx, args, release)
	return nil
}

func (w *deployWorker) deployFailed(parent, run context.Context, args DeployArgs, err error) error {
	id := args.DeploymentID
	idText := id.String()
	cleanup := context.WithoutCancel(run)

	if errors.Is(err, runtime.ErrCanceled) || w.isCanceled(cleanup, id) {
		w.logs.Publish(cleanup, idText, "Deployment canceled")
		w.discard(cleanup, args)
		w.setDeploymentStatus(cleanup, id, "canceled")
		return nil
	}
	switch outcomeOf(parent, run) {
	case outcomeTimedOut:
		timeout := fmt.Errorf("deploy exceeded timeout of %s", deployTimeout)
		w.logs.Publish(cleanup, idText, "Deployment timed out")
		w.failDeployment(cleanup, id, "timeout", timeout)
		return river.JobCancel(timeout)
	case outcomeShutdown:
		return err
	}
	w.logs.Publish(cleanup, idText, fmt.Sprintf("Deployment failed: %v", err))
	w.failDeployment(cleanup, id, "deploy", err)
	return river.JobCancel(err)
}

// discard removes what a canceled deployment created: its image and, unless
// another deployment is live on the same service, the service itself.
func (w *deployWorker) discard(ctx context.Context, args DeployArgs) {
	id := args.DeploymentID
	idText := id.String()

	if err := w.deps.Builder.DeleteImages(ctx, []build.Image{{URI: args.ImageURI}}); err != nil {
		slog.Error("failed to delete the image of a canceled deployment", "deployment_id", id, "image", args.ImageURI, "error", err)
		w.logs.Publish(ctx, idText, fmt.Sprintf("Warning: failed to delete canceled image: %v", err))
	}

	otherLive, err := w.queries.ProjectHasOtherLiveDeployment(ctx, id)
	if err != nil {
		slog.Error("failed to check for a live deployment", "deployment_id", id, "error", err)
		otherLive = true // keep the service rather than risk removing a live one
	}
	if otherLive {
		w.logs.Publish(ctx, idText, "Skipping cloud teardown because an existing live deployment owns this service")
		return
	}
	if err := w.deps.Runtime.Destroy(ctx, runtime.AppRef{Subdomain: args.Subdomain}); err != nil {
		slog.Error("failed to clean up a canceled deployment", "deployment_id", id, "error", err)
		w.logs.Publish(ctx, idText, fmt.Sprintf("Warning: failed to clean up canceled resources: %v", err))
		return
	}
	w.logs.Publish(ctx, idText, "Canceled deployment resources cleaned up")
}

func (w *deployWorker) finish(ctx context.Context, args DeployArgs, release runtime.Release) {
	id := args.DeploymentID
	ctx, cancel := bounded(ctx, 5*time.Second)
	defer cancel()

	rows, err := w.queries.FinishDeployment(ctx, dbpkg.FinishDeploymentParams{
		ID:             id,
		ImageUri:       &args.ImageURI,
		Url:            nullable(release.PublicURL),
		EcsTaskArn:     nullable(release.TaskDefinition),
		EcsServiceName: nullable(release.ServiceName),
		TargetGroupArn: nullable(release.TargetGroup),
	})
	if err != nil {
		slog.Error("failed to finalize deployment", "deployment_id", id, "error", err)
		w.logs.Publish(ctx, id.String(), fmt.Sprintf("Warning: Deployment live but status update failed: %v", err))
		return
	}
	if rows == 0 {
		w.logs.Publish(ctx, id.String(), "Deployment finished after cancellation; skipping live status update")
	}
}

// envVars returns the deployment's environment variables, decrypted.
func (w *deployWorker) envVars(ctx context.Context, id uuid.UUID) (map[string]string, error) {
	ctx, cancel := bounded(ctx, 5*time.Second)
	defer cancel()

	rows, err := w.queries.GetEnvVarsByDeployment(ctx, id)
	if err != nil {
		return nil, err
	}
	env := make(map[string]string, len(rows))
	for _, row := range rows {
		value, err := w.deps.Secrets.Decrypt(row.Value)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt env var %s: %w", row.Key, err)
		}
		env[row.Key] = value
	}
	return env, nil
}

// nullable is s, or nil when the provider has nothing to report for it.
func nullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
