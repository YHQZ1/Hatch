// Package cost estimates what running an app costs. Cost guardrails (Phase 4)
// are built on it; nothing calls it yet.
package cost

import (
	"context"

	"github.com/YHQZ1/hatch/internal/runtime"
)

// Monthly is an estimated monthly cost in US cents, so no arithmetic is done on
// floating-point dollars.
type Monthly struct {
	Cents int64
	// Note says what the estimate leaves out, shown next to the number.
	Note string
}

// Estimator prices a deployment before it is created.
type Estimator interface {
	Estimate(ctx context.Context, spec runtime.DeploySpec) (Monthly, error)
}
