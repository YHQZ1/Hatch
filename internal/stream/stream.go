// Package stream carries a deployment's log lines from the code producing them
// (builders, runtimes, jobs) to whoever is watching.
package stream

import "context"

// Sink receives the log lines of one deployment. Publish never fails the
// caller: losing a log line must not fail a build or a deploy.
type Sink interface {
	Publish(ctx context.Context, deploymentID, line string)
}

// Discard is a Sink that drops every line.
type Discard struct{}

func (Discard) Publish(context.Context, string, string) {}
