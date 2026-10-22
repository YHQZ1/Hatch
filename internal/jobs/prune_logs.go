package jobs

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/riverqueue/river"

	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
)

// A finished deployment's log is kept for LogRetention, except that the newest
// KeptLogs deployments of each project keep theirs however old: the log of what
// runs now is the first thing wanted when something breaks. The deployment
// itself stays; its page then says no log was kept.
const (
	LogRetention = 30 * 24 * time.Hour
	KeptLogs     = 5

	// pruneEvery is how often old logs are looked for.
	pruneEvery = 24 * time.Hour

	// pruneBatch is how many lines one delete removes, so that a long backlog
	// never holds a big transaction open.
	pruneBatch = 5000

	pruneTimeout = 10 * time.Minute
)

type pruneLogsWorker struct {
	river.WorkerDefaults[PruneLogsArgs]
	deps Deps
	records
}

func newPruneLogsWorker(deps Deps) *pruneLogsWorker {
	return &pruneLogsWorker{deps: deps, records: newRecords(deps.Pool, deps.Logs)}
}

func (w *pruneLogsWorker) Timeout(*river.Job[PruneLogsArgs]) time.Duration { return pruneTimeout }

// Work deletes the lines that are past their retention. Stopping early is fine:
// whatever is left is deleted by the next run.
func (w *pruneLogsWorker) Work(ctx context.Context, _ *river.Job[PruneLogsArgs]) error {
	removed, err := w.prune(ctx, time.Now().Add(-LogRetention))
	if removed > 0 {
		slog.Info("deleted old deployment logs", "lines", removed)
	}
	if err != nil {
		return fmt.Errorf("failed to delete old deployment logs: %w", err)
	}
	return nil
}

// prune deletes the log lines of deployments created before olderThan and
// returns how many it removed.
func (w *pruneLogsWorker) prune(ctx context.Context, olderThan time.Time) (int64, error) {
	var total int64
	for {
		n, err := w.queries.PruneDeploymentLogs(ctx, dbpkg.PruneDeploymentLogsParams{
			OlderThan: olderThan,
			Keep:      KeptLogs,
			BatchSize: pruneBatch,
		})
		total += n
		if err != nil || n == 0 {
			return total, err
		}
	}
}

// periodicJobs are the jobs River queues on a timer. Only the process that is
// the River leader queues them, so running several never doubles them.
func periodicJobs() []*river.PeriodicJob {
	return []*river.PeriodicJob{
		river.NewPeriodicJob(
			river.PeriodicInterval(pruneEvery),
			func() (river.JobArgs, *river.InsertOpts) { return PruneLogsArgs{}, nil },
			&river.PeriodicJobOpts{RunOnStart: true},
		),
	}
}
