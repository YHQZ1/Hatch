package proxy

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// clock is a Stats clock the test moves by hand.
type clock struct{ t time.Time }

func (c *clock) now() time.Time { return c.t }

func newStats(t *testing.T) (*Stats, *clock) {
	t.Helper()
	c := &clock{t: time.Date(2026, 10, 22, 12, 0, 30, 0, time.UTC)}
	s := NewStats()
	s.now = c.now
	return s, c
}

func TestStatsCountRequestsPerMinute(t *testing.T) {
	s, c := newStats(t)

	s.Record("shop", 200, 10*time.Millisecond)
	s.Record("shop", 200, 30*time.Millisecond)
	c.t = c.t.Add(time.Minute)
	s.Record("shop", 503, 20*time.Millisecond)

	got := s.Snapshot("shop")
	if got.TotalRequests != 3 || got.TotalErrors != 1 {
		t.Fatalf("totals = %d requests, %d errors", got.TotalRequests, got.TotalErrors)
	}
	if got.Requests[Window-1] != 1 || got.Requests[Window-2] != 2 || got.Errors[Window-1] != 1 {
		t.Errorf("series ends %v / errors %v; want the newest minute last", got.Requests[Window-3:], got.Errors[Window-3:])
	}
	if got.AvgLatencyMs != 20 {
		t.Errorf("average latency = %v, want 20", got.AvgLatencyMs)
	}
	if got.LastRequestAt == nil || !got.LastRequestAt.Equal(c.t) {
		t.Errorf("last request = %v, want %v", got.LastRequestAt, c.t)
	}
}

func TestStatsForgetMinutesOlderThanTheWindow(t *testing.T) {
	s, c := newStats(t)
	s.Record("shop", 200, time.Millisecond)

	c.t = c.t.Add(time.Duration(Window-1) * time.Minute)
	if got := s.Snapshot("shop"); got.TotalRequests != 1 || got.Requests[0] != 1 {
		t.Fatalf("59 minutes later: total %d, first minute %d; want the request at the oldest edge", got.TotalRequests, got.Requests[0])
	}

	c.t = c.t.Add(time.Minute)
	got := s.Snapshot("shop")
	if got.TotalRequests != 0 {
		t.Fatalf("60 minutes later: total %d, want 0", got.TotalRequests)
	}
	if got.LastRequestAt == nil {
		t.Error("the time of the last request was forgotten with the window")
	}
}

func TestAStaleBucketIsReusedNotAdded(t *testing.T) {
	s, c := newStats(t)
	s.Record("shop", 200, time.Millisecond)

	// Exactly one window later the same bucket slot is for a new minute.
	c.t = c.t.Add(Window * time.Minute)
	s.Record("shop", 200, time.Millisecond)

	if got := s.Snapshot("shop"); got.TotalRequests != 1 {
		t.Fatalf("total = %d, want only the new minute's request", got.TotalRequests)
	}
}

func TestAnAppWithNoRequestsHasAnEmptyFullLengthSeries(t *testing.T) {
	s, _ := newStats(t)

	got := s.Snapshot("nothing")

	if len(got.Requests) != Window || len(got.Errors) != Window || got.TotalRequests != 0 || got.LastRequestAt != nil {
		t.Fatalf("snapshot = %+v", got)
	}
}

func TestAppsAreCountedSeparately(t *testing.T) {
	s, _ := newStats(t)
	s.Record("shop", 200, time.Millisecond)
	s.Record("blog", 200, time.Millisecond)
	s.Record("blog", 200, time.Millisecond)

	if s.Snapshot("shop").TotalRequests != 1 || s.Snapshot("blog").TotalRequests != 2 {
		t.Fatal("counts leaked between apps")
	}
}

func TestOnlyServerErrorsAreErrors(t *testing.T) {
	s, _ := newStats(t)
	for _, status := range []int{200, 301, 404, 499, 500, 502, 503} {
		s.Record("shop", status, 0)
	}

	if got := s.Snapshot("shop").TotalErrors; got != 3 {
		t.Fatalf("errors = %d, want 3 (the 5xx)", got)
	}
}

func TestTheProxyCountsRequestsThatReachAnApp(t *testing.T) {
	app := backend(t)
	stats := NewStats()
	p := New(&fakeResolver{apps: map[string]string{"shop": strings.TrimPrefix(app.URL, "http://")}}, "localhost", stats)

	get(t, p, "shop.localhost", "/")
	get(t, p, "shop.localhost", "/again")

	got := stats.Snapshot("shop")
	if got.TotalRequests != 2 || got.TotalErrors != 0 {
		t.Fatalf("shop: %d requests, %d errors", got.TotalRequests, got.TotalErrors)
	}
	if got.LastRequestAt == nil {
		t.Error("no last request time")
	}
}

func TestTheProxyDoesNotCountRequestsThatNameNoApp(t *testing.T) {
	stats := NewStats()
	p := New(&fakeResolver{}, "localhost", stats)

	get(t, p, "nothing.localhost", "/")
	get(t, p, "localhost", "/")

	if len(stats.apps) != 0 {
		t.Fatalf("stats recorded %d apps for requests that reached none", len(stats.apps))
	}
}

func TestAnAppThatDoesNotAnswerCountsAsAnError(t *testing.T) {
	stats := NewStats()
	// Nothing listens on this address.
	p := New(&fakeResolver{apps: map[string]string{"shop": "127.0.0.1:1"}}, "localhost", stats)

	if rec := get(t, p, "shop.localhost", "/"); rec.Code != http.StatusBadGateway {
		t.Fatalf("status %d", rec.Code)
	}

	if got := stats.Snapshot("shop"); got.TotalRequests != 1 || got.TotalErrors != 1 {
		t.Fatalf("%d requests, %d errors; want the failed request counted as an error", got.TotalRequests, got.TotalErrors)
	}
}

func TestAnAppsErrorStatusIsCounted(t *testing.T) {
	app := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "broken", http.StatusInternalServerError)
	}))
	t.Cleanup(app.Close)
	stats := NewStats()
	p := New(&fakeResolver{apps: map[string]string{"shop": strings.TrimPrefix(app.URL, "http://")}}, "localhost", stats)

	get(t, p, "shop.localhost", "/")

	if got := stats.Snapshot("shop"); got.TotalErrors != 1 {
		t.Fatalf("errors = %d, want 1", got.TotalErrors)
	}
}

func TestTheRecorderLeavesFlushingAndHijackingToTheRealWriter(t *testing.T) {
	rec := &recorder{ResponseWriter: httptest.NewRecorder()}
	if err := http.NewResponseController(rec).Flush(); err != nil {
		t.Fatalf("Flush through the recorder: %v", err)
	}
}
