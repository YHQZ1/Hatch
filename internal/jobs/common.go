package jobs

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/YHQZ1/hatch/internal/stream"
)

// records wraps the queries the workers share. Its methods log failures instead
// of returning them: they record progress, and losing a progress update must
// not stop the job doing the work.
type records struct {
	pool    *pgxpool.Pool
	queries *dbpkg.Queries
	logs    stream.Sink
}

func newRecords(pool *pgxpool.Pool, logs stream.Sink) records {
	return records{pool: pool, queries: dbpkg.New(pool), logs: logs}
}

// bounded gives parent a deadline unless it already has one. Updates made while
// a job is shutting down use a fresh context, which has none.
func bounded(parent context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	if _, ok := parent.Deadline(); ok {
		return context.WithCancel(parent)
	}
	return context.WithTimeout(parent, timeout)
}

func (s records) isCanceled(ctx context.Context, deploymentID uuid.UUID) bool {
	canceled, err := s.deploymentCanceled(ctx, deploymentID)
	return err == nil && canceled
}

func (s records) deploymentCanceled(ctx context.Context, deploymentID uuid.UUID) (bool, error) {
	ctx, cancel := bounded(ctx, 2*time.Second)
	defer cancel()
	status, err := s.queries.GetDeploymentStatus(ctx, deploymentID)
	if err != nil {
		return false, err
	}
	return status == "canceled", nil
}

func (s records) setDeploymentStatus(ctx context.Context, deploymentID uuid.UUID, status string) {
	ctx, cancel := bounded(ctx, 5*time.Second)
	defer cancel()
	if err := s.queries.SetDeploymentStatus(ctx, dbpkg.SetDeploymentStatusParams{ID: deploymentID, Status: status}); err != nil {
		slog.Error("failed to update deployment status", "deployment_id", deploymentID, "status", status, "error", err)
	}
}

func (s records) failDeployment(ctx context.Context, deploymentID uuid.UUID, stage string, cause error) {
	ctx, cancel := bounded(ctx, 5*time.Second)
	defer cancel()
	message := cause.Error()
	if err := s.queries.FailDeployment(ctx, dbpkg.FailDeploymentParams{
		ID: deploymentID, ErrorStage: &stage, ErrorMessage: &message,
	}); err != nil {
		slog.Error("failed to mark deployment failed", "deployment_id", deploymentID, "stage", stage, "error", err)
	}
}

func (s records) failProject(ctx context.Context, projectID uuid.UUID, status string, cause error) {
	ctx, cancel := bounded(ctx, 5*time.Second)
	defer cancel()
	message := cause.Error()
	if err := s.queries.MarkProjectOperationFailed(ctx, dbpkg.MarkProjectOperationFailedParams{
		ID: projectID, Status: status, DeleteError: &message,
	}); err != nil {
		slog.Error("failed to record project operation failure", "project_id", projectID, "status", status, "error", err)
	}
}

func (s records) setProjectStatus(ctx context.Context, projectID uuid.UUID, status string) {
	ctx, cancel := bounded(ctx, 5*time.Second)
	defer cancel()
	if err := s.queries.SetProjectStatus(ctx, dbpkg.SetProjectStatusParams{ID: projectID, Status: status}); err != nil {
		slog.Error("failed to update project status", "project_id", projectID, "status", status, "error", err)
	}
}

// watchCancellation cancels a job's context as soon as its deployment is
// canceled. The returned function stops the watcher.
func (s records) watchCancellation(ctx context.Context, deploymentID uuid.UUID, cancel context.CancelFunc) (stop func()) {
	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(250 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-done:
				return
			case <-ticker.C:
				if s.isCanceled(context.Background(), deploymentID) {
					cancel()
					return
				}
			}
		}
	}()
	return func() { close(done) }
}

// outcome says why a context ended, for a job that stopped early.
type outcome int

const (
	outcomeRunning  outcome = iota // the job's own error, not its context
	outcomeTimedOut                // it ran out of time
	outcomeShutdown                // Hatch is stopping; the job will be retried
)

// outcomeOf tells a timeout and a shutdown apart from a failure. parent is the
// context River gave the job; run is the one derived for the work.
func outcomeOf(parent, run context.Context) outcome {
	switch {
	case errors.Is(run.Err(), context.DeadlineExceeded):
		return outcomeTimedOut
	case parent.Err() != nil:
		return outcomeShutdown
	default:
		return outcomeRunning
	}
}

func shortID(id uuid.UUID) string {
	return id.String()[:8]
}
