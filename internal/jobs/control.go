package jobs

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/riverqueue/river"

	"github.com/YHQZ1/hatch/internal/build"
	"github.com/YHQZ1/hatch/internal/runtime"
)

type destroyAppWorker struct {
	river.WorkerDefaults[DestroyAppArgs]
	deps Deps
	records
}

func newDestroyAppWorker(deps Deps) *destroyAppWorker {
	return &destroyAppWorker{deps: deps, records: newRecords(deps.Pool, deps.Logs)}
}

func (w *destroyAppWorker) Timeout(*river.Job[DestroyAppArgs]) time.Duration {
	return destroyTimeout + time.Minute
}

// Work removes the app's cloud resources and images, then the project. A
// failure leaves the project marked delete_failed so the user can try again.
func (w *destroyAppWorker) Work(ctx context.Context, job *river.Job[DestroyAppArgs]) error {
	args := job.Args
	if err := args.Validate(); err != nil {
		if args.ProjectID.String() != "" {
			w.failProject(ctx, args.ProjectID, "delete_failed", err)
		}
		return river.JobCancel(err)
	}

	runCtx, cancel := context.WithTimeout(ctx, destroyTimeout)
	defer cancel()
	fail := func(err error) error {
		if outcomeOf(ctx, runCtx) == outcomeShutdown {
			return err
		}
		slog.Error("failed to delete project", "project_id", args.ProjectID, "error", err)
		w.failProject(context.WithoutCancel(runCtx), args.ProjectID, "delete_failed", err)
		return river.JobCancel(err)
	}

	if err := w.deps.Runtime.Destroy(runCtx, runtime.AppRef{Subdomain: args.Subdomain}); err != nil {
		return fail(err)
	}
	uris, err := w.queries.GetProjectImageURIs(runCtx, args.ProjectID)
	if err != nil {
		return fail(fmt.Errorf("failed to list project images: %w", err))
	}
	images := make([]build.Image, len(uris))
	for i, uri := range uris {
		images[i] = build.Image{URI: uri}
	}
	if err := w.deps.Builder.DeleteImages(runCtx, images); err != nil {
		return fail(err)
	}
	if err := w.queries.DeleteProject(runCtx, args.ProjectID); err != nil {
		return fail(fmt.Errorf("failed to delete project record: %w", err))
	}
	return nil
}

type scaleWorker struct {
	river.WorkerDefaults[ScaleArgs]
	deps Deps
	records
}

func newScaleWorker(deps Deps) *scaleWorker {
	return &scaleWorker{deps: deps, records: newRecords(deps.Pool, deps.Logs)}
}

func (w *scaleWorker) Timeout(*river.Job[ScaleArgs]) time.Duration {
	return scaleTimeout + time.Minute
}

// Work pauses (0 replicas) or resumes (1) a project's service and records the
// result on the project.
func (w *scaleWorker) Work(ctx context.Context, job *river.Job[ScaleArgs]) error {
	args := job.Args
	if err := args.Validate(); err != nil {
		w.failProject(ctx, args.ProjectID, "service_control_failed", err)
		return river.JobCancel(err)
	}

	success, failure, verb := "active", "resume_failed", "resume"
	if args.Replicas == 0 {
		success, failure, verb = "suspended", "suspend_failed", "suspend"
	}

	runCtx, cancel := context.WithTimeout(ctx, scaleTimeout)
	defer cancel()
	if err := w.deps.Runtime.Scale(runCtx, runtime.AppRef{Subdomain: args.Subdomain}, args.Replicas); err != nil {
		if outcomeOf(ctx, runCtx) == outcomeShutdown {
			return err
		}
		slog.Error("failed to scale project", "action", verb, "subdomain", args.Subdomain, "error", err)
		w.failProject(context.WithoutCancel(runCtx), args.ProjectID, failure, err)
		return river.JobCancel(err)
	}
	w.setProjectStatus(runCtx, args.ProjectID, success)
	return nil
}
