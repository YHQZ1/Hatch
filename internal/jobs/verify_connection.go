package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"

	awsconn "github.com/YHQZ1/hatch/internal/cloud/aws"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
)

// verifyTimeout bounds one check: assuming the role and reading a stack are two
// quick calls, so a long wait means something is wrong.
const verifyTimeout = 2 * time.Minute

type verifyConnectionWorker struct {
	river.WorkerDefaults[VerifyConnectionArgs]
	deps    Deps
	queries *dbpkg.Queries
}

func newVerifyConnectionWorker(deps Deps) *verifyConnectionWorker {
	return &verifyConnectionWorker{deps: deps, queries: dbpkg.New(deps.Pool)}
}

func (w *verifyConnectionWorker) Timeout(*river.Job[VerifyConnectionArgs]) time.Duration {
	return verifyTimeout + time.Minute
}

// Work checks the connection and records the result on it: connected with what
// the stack reported, or error with a message the user can act on. A check that
// fails is recorded and not retried, like every other job; the user checks again
// when they have fixed what it says. Only Hatch stopping part-way leaves it to
// run again.
func (w *verifyConnectionWorker) Work(ctx context.Context, job *river.Job[VerifyConnectionArgs]) error {
	args := job.Args
	if err := args.Validate(); err != nil {
		return river.JobCancel(err)
	}

	conn, err := w.queries.GetCloudConnection(ctx, args.ConnectionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil // removed while it was queued
	}
	if err != nil {
		return fmt.Errorf("read the connection: %w", err)
	}
	if conn.RoleArn == nil || *conn.RoleArn != args.RoleARN {
		return nil // the user has given another role since; that one has its own check
	}

	if w.deps.Connections == nil {
		return w.recordError(ctx, args, errors.New("this Hatch server has no AWS credentials to assume the role with; ask whoever runs it"))
	}

	runCtx, cancel := context.WithTimeout(ctx, verifyTimeout)
	defer cancel()
	found, err := w.deps.Connections.Verify(runCtx, awsconn.Connection{
		RoleARN: args.RoleARN, ExternalID: conn.ExternalID, Region: conn.Region, StackName: conn.StackName,
	})
	if err != nil {
		switch outcomeOf(ctx, runCtx) {
		case outcomeShutdown:
			return err
		case outcomeTimedOut:
			err = fmt.Errorf("checking the connection took longer than %s; try again", verifyTimeout)
		}
		return w.recordError(ctx, args, err)
	}

	outputs, err := json.Marshal(found.Outputs)
	if err != nil {
		return w.recordError(ctx, args, fmt.Errorf("could not save what the stack reported: %w", err))
	}
	rows, err := w.queries.RecordCloudConnectionVerified(context.WithoutCancel(ctx), dbpkg.RecordCloudConnectionVerifiedParams{
		ID: args.ConnectionID, RoleArn: &args.RoleARN, AwsAccountID: &found.AccountID,
		TemplateVersion: &found.Outputs.TemplateVersion, ServesHttps: &found.Outputs.ServesHTTPS, StackOutputs: outputs,
	})
	if err != nil {
		return fmt.Errorf("record the connection as verified: %w", err)
	}
	slog.InfoContext(ctx, "connection verified", "connection_id", args.ConnectionID, "recorded", rows == 1, "template_up_to_date", found.Outputs.UpToDate())
	return nil
}

// recordError writes what went wrong on the connection and cancels the job. If
// writing it fails too, the job is retried so the user is not left waiting.
func (w *verifyConnectionWorker) recordError(ctx context.Context, args VerifyConnectionArgs, cause error) error {
	message := cause.Error()
	if _, err := w.queries.RecordCloudConnectionError(context.WithoutCancel(ctx), dbpkg.RecordCloudConnectionErrorParams{
		ID: args.ConnectionID, RoleArn: &args.RoleARN, LastError: &message,
	}); err != nil {
		return fmt.Errorf("record the connection's error %q: %w", message, err)
	}
	slog.WarnContext(ctx, "connection could not be verified", "connection_id", args.ConnectionID, "error", cause)
	return river.JobCancel(cause)
}
