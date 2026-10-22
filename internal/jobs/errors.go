package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

// panicHandler fails the deployment of a build or deploy job that panicked, so
// it does not sit in "building" forever, and stops the job: a panic will
// happen again.
type panicHandler struct {
	deps Deps
}

func (h *panicHandler) HandleError(context.Context, *rivertype.JobRow, error) *river.ErrorHandlerResult {
	return nil
}

func (h *panicHandler) HandlePanic(ctx context.Context, job *rivertype.JobRow, panicVal any, trace string) *river.ErrorHandlerResult {
	slog.Error("job panicked", "kind", job.Kind, "job_id", job.ID, "panic", fmt.Sprint(panicVal), "trace", trace)

	if job.Kind == (BuildArgs{}).Kind() || job.Kind == (DeployArgs{}).Kind() {
		var args struct {
			DeploymentID uuid.UUID `json:"deployment_id"`
		}
		if err := json.Unmarshal(job.EncodedArgs, &args); err == nil && args.DeploymentID != uuid.Nil {
			s := newRecords(h.deps.Pool, h.deps.Logs)
			err := fmt.Errorf("%s panic: %v", job.Kind, panicVal)
			s.logs.Publish(ctx, args.DeploymentID.String(), "Failed: "+err.Error())
			s.failDeployment(ctx, args.DeploymentID, job.Kind, err)
		}
	}
	return &river.ErrorHandlerResult{SetCancelled: true}
}
