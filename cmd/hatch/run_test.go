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

// fakeWorker blocks in Start until Stop is called, like the real workers.
type fakeWorker struct {
	stop     chan struct{}
	startErr error
	stopped  atomic.Bool
}

func newFakeWorker() *fakeWorker { return &fakeWorker{stop: make(chan struct{})} }

func (w *fakeWorker) Start() error {
	if w.startErr != nil {
		return w.startErr
	}
	<-w.stop
	return nil
}

func (w *fakeWorker) Stop() {
	w.stopped.Store(true)
	close(w.stop)
}

func TestSuperviseWorkerStopsTheWorkerWhenContextEnds(t *testing.T) {
	w := newFakeWorker()
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan error, 1)
	go func() { done <- superviseWorker(ctx, "fake", w) }()
	cancel()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("error = %v, want nil after a clean stop", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("superviseWorker did not return")
	}
	if !w.stopped.Load() {
		t.Fatal("Stop was not called")
	}
}

func TestSuperviseWorkerReturnsAWorkerFailure(t *testing.T) {
	w := newFakeWorker()
	w.startErr = errors.New("cannot connect")

	err := superviseWorker(context.Background(), "fake", w)
	if err == nil || err.Error() != "cannot connect" {
		t.Fatalf("error = %v, want the worker's error", err)
	}
	if w.stopped.Load() {
		t.Fatal("Stop should not be called for a worker that already failed")
	}
}
