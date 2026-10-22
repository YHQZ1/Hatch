package proxy

import (
	"net/http"
	"sync"
	"time"
)

// Window is how much history the traffic stats keep, in one-minute buckets.
const Window = 60

// Stats counts the requests the proxy passes to each app, for the last hour. It
// lives in memory: it starts empty when Hatch starts and is not shared between
// processes.
type Stats struct {
	now   func() time.Time
	since time.Time

	mu   sync.Mutex
	apps map[string]*appStats
}

type bucket struct {
	minute   int64 // unix minute this bucket holds; a different minute means it is stale
	requests int64
	errors   int64
	millis   float64 // summed time to first byte
}

type appStats struct {
	buckets [Window]bucket
	last    time.Time
}

// NewStats returns empty stats.
func NewStats() *Stats {
	s := &Stats{now: time.Now, apps: map[string]*appStats{}}
	s.since = s.now()
	return s
}

// Since is when the stats started counting.
func (s *Stats) Since() time.Time { return s.since }

// Record counts one request to the app. A status of 500 or more is an error.
// ttfb is how long the app took to start answering.
func (s *Stats) Record(app string, status int, ttfb time.Duration) {
	now := s.now()
	minute := now.Unix() / 60

	s.mu.Lock()
	defer s.mu.Unlock()
	a := s.apps[app]
	if a == nil {
		a = &appStats{}
		s.apps[app] = a
	}
	b := &a.buckets[minute%Window]
	if b.minute != minute {
		*b = bucket{minute: minute}
	}
	b.requests++
	if status >= http.StatusInternalServerError {
		b.errors++
	}
	b.millis += float64(ttfb) / float64(time.Millisecond)
	a.last = now
}

// Traffic is one app's last hour.
type Traffic struct {
	// Requests and Errors are per minute, oldest first, Window entries each.
	Requests []int64 `json:"requests"`
	Errors   []int64 `json:"errors"`
	// Totals over the window.
	TotalRequests int64 `json:"total_requests"`
	TotalErrors   int64 `json:"total_errors"`
	// AvgLatencyMs is the mean time to first byte, 0 when there were no requests.
	AvgLatencyMs float64 `json:"avg_latency_ms"`
	// LastRequestAt is the latest request ever counted, even beyond the window;
	// nil when none since the stats started.
	LastRequestAt *time.Time `json:"last_request_at"`
}

// Snapshot returns the app's last hour, an empty one for an app with no
// requests.
func (s *Stats) Snapshot(app string) Traffic {
	now := s.now()
	nowMinute := now.Unix() / 60

	t := Traffic{Requests: make([]int64, Window), Errors: make([]int64, Window)}
	s.mu.Lock()
	defer s.mu.Unlock()
	a := s.apps[app]
	if a == nil {
		return t
	}
	var millis float64
	for i := range Window {
		minute := nowMinute - (Window - 1) + int64(i)
		b := a.buckets[((minute%Window)+Window)%Window]
		if b.minute != minute {
			continue
		}
		t.Requests[i], t.Errors[i] = b.requests, b.errors
		t.TotalRequests += b.requests
		t.TotalErrors += b.errors
		millis += b.millis
	}
	if t.TotalRequests > 0 {
		t.AvgLatencyMs = millis / float64(t.TotalRequests)
	}
	if !a.last.IsZero() {
		last := a.last
		t.LastRequestAt = &last
	}
	return t
}

// recorder notes the status an app answered with and how long it took to start
// answering, without getting in the way of streaming or WebSocket upgrades:
// Unwrap lets http.ResponseController reach the real writer.
type recorder struct {
	http.ResponseWriter
	start  time.Time
	status int
	ttfb   time.Duration
	wrote  bool
}

func (r *recorder) markWritten(status int) {
	if r.wrote {
		return
	}
	r.wrote = true
	r.status = status
	r.ttfb = time.Since(r.start)
}

func (r *recorder) WriteHeader(status int) {
	// 1xx responses are interim: the real one follows.
	if status >= 200 {
		r.markWritten(status)
	}
	r.ResponseWriter.WriteHeader(status)
}

func (r *recorder) Write(b []byte) (int, error) {
	r.markWritten(http.StatusOK)
	return r.ResponseWriter.Write(b)
}

func (r *recorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }
