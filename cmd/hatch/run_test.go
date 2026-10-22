package main

import (
	"context"
	"errors"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestRunTogetherStopsEveryoneWhenOneFails(t *testing.T) {
	var stopped atomic.Bool
	waiter := component{"waiter", func(ctx context.Context) error {
		<-ctx.Done()
		stopped.Store(true)
		return nil
	}}
	failing := component{"failing", func(ctx context.Context) error {
		return errors.New("boom")
	}}

	done := make(chan error, 1)
	go func() { done <- runTogether(waiter, failing) }()

	select {
	case err := <-done:
		if err == nil || !strings.Contains(err.Error(), "failing: boom") {
			t.Fatalf("error = %v, want one naming the failing component", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("runTogether did not return after a component failed")
	}
	if !stopped.Load() {
		t.Fatal("the healthy component was not told to stop")
	}
}
