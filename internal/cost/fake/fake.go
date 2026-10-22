// Package fake is a cost.Estimator for tests.
package fake

import (
	"context"

	"github.com/YHQZ1/hatch/internal/cost"
	"github.com/YHQZ1/hatch/internal/runtime"
)

// Estimator returns the same estimate for every spec.
type Estimator struct {
	Result cost.Monthly
	Err    error
}

func (e Estimator) Estimate(context.Context, runtime.DeploySpec) (cost.Monthly, error) {
	return e.Result, e.Err
}
