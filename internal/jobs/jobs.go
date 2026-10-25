package jobs

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivertype"

	"github.com/YHQZ1/hatch/internal/build"
	"github.com/YHQZ1/hatch/internal/runtime"
	"github.com/YHQZ1/hatch/internal/secrets"
	"github.com/YHQZ1/hatch/internal/stream"
)

// Inserter enqueues jobs inside a transaction, so a job exists exactly when the
// change that caused it was committed. *river.Client satisfies it.
type Inserter interface {
	InsertTx(ctx context.Context, tx pgx.Tx, args river.JobArgs, opts *river.InsertOpts) (*rivertype.JobInsertResult, error)
}

// NewInserter returns a client that can enqueue jobs but never works them, for
// processes that only cause jobs, such as the API.
func NewInserter(pool *pgxpool.Pool) (*river.Client[pgx.Tx], error) {
	client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{})
	if err != nil {
		return nil, fmt.Errorf("create job client: %w", err)
	}
	return client, nil
}

// CloneTokenSource gives a token that can read one GitHub repository. It is
// satisfied by *githubapp.App.
type CloneTokenSource interface {
	InstallationToken(ctx context.Context, owner, name string) (string, error)
}

// Deps is what the workers need.
type Deps struct {
	Pool        *pgxpool.Pool
	Builder     build.Builder
	Runtime     runtime.Runtime
	Logs        stream.Sink
	Secrets     *secrets.Codec
	CloneTokens CloneTokenSource

	// BuildTimeout bounds one build.
	BuildTimeout time.Duration
}

// Timeouts for the other jobs.
const (
	deployTimeout  = 15 * time.Minute
	destroyTimeout = 12 * time.Minute
	scaleTimeout   = 10 * time.Minute
)

// Workers registers the Hatch workers.
func Workers(deps Deps) (*river.Workers, error) {
	workers := river.NewWorkers()
	for _, add := range []error{
		river.AddWorkerSafely(workers, newBuildWorker(deps)),
		river.AddWorkerSafely(workers, newDeployWorker(deps)),
		river.AddWorkerSafely(workers, newDestroyAppWorker(deps)),
		river.AddWorkerSafely(workers, newScaleWorker(deps)),
		river.AddWorkerSafely(workers, newPruneLogsWorker(deps)),
	} {
		if add != nil {
			return nil, add
		}
	}
	return workers, nil
}

// NewClient returns a client that works jobs with deps. Start it to begin.
func NewClient(deps Deps) (*river.Client[pgx.Tx], error) {
	workers, err := Workers(deps)
	if err != nil {
		return nil, err
	}
	longest := max(deps.BuildTimeout, deployTimeout, destroyTimeout, scaleTimeout, pruneTimeout)
	client, err := river.NewClient(riverpgxv5.New(deps.Pool), &river.Config{
		Logger: slog.Default(),
		Queues: map[string]river.QueueConfig{
			queueBuild:   {MaxWorkers: 1},
			queueDeploy:  {MaxWorkers: 1},
			queueControl: {MaxWorkers: 2},
		},
		Workers:      workers,
		PeriodicJobs: periodicJobs(),
		// Each worker sets its own timeout; this one only has to be longer.
		JobTimeout: longest + time.Minute,
		// A job still "running" after this long belongs to a process that died:
		// River puts it back in the queue for its second attempt.
		RescueStuckJobsAfter: longest + 5*time.Minute,
		ErrorHandler:         &panicHandler{deps: deps},
	})
	if err != nil {
		return nil, fmt.Errorf("create job client: %w", err)
	}
	return client, nil
}

// Run works jobs until ctx is canceled. It lets running jobs finish for up to
// grace, then cancels them; a canceled job is picked up again on the next
// start.
func Run(ctx context.Context, deps Deps, grace time.Duration) error {
	client, err := NewClient(deps)
	if err != nil {
		return err
	}
	// River's own context must outlive ctx so that jobs can be given time to
	// finish after shutdown starts.
	workCtx, stopping := withStopping(context.WithoutCancel(ctx))
	workCtx, cancelWork := context.WithCancel(workCtx)
	defer cancelWork()
	if err := client.Start(workCtx); err != nil {
		return fmt.Errorf("start the job runner: %w", err)
	}
	slog.Info("job runner started")

	<-ctx.Done()
	stopping.Store(true)
	slog.Info("job runner stopping", "grace", grace)

	stopCtx, cancel := context.WithTimeout(context.Background(), grace)
	defer cancel()
	err = client.Stop(stopCtx)
	if errors.Is(err, context.DeadlineExceeded) {
		slog.Warn("jobs still running after the grace period; canceling them")
		cancelStop, cancelStopFn := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancelStopFn()
		err = client.StopAndCancel(cancelStop)
	}
	if err != nil && !errors.Is(err, context.Canceled) {
		return fmt.Errorf("stop the job runner: %w", err)
	}
	slog.Info("job runner stopped")
	return nil
}
