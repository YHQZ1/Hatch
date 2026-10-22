package proxy

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeResolver struct {
	mu    sync.Mutex
	apps  map[string]string // subdomain -> address
	err   map[string]error
	calls int
}

func (f *fakeResolver) Resolve(_ context.Context, sub string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if err := f.err[sub]; err != nil {
		return "", err
	}
	if addr, ok := f.apps[sub]; ok {
		return addr, nil
	}
	return "", ErrNotFound
}

func (f *fakeResolver) lookups() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

// backend is an app: it echoes what the proxy told it.
func backend(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Seen-Host", r.Host)
		w.Header().Set("X-Seen-Forwarded-Host", r.Header.Get("X-Forwarded-Host"))
		_, _ = io.WriteString(w, "hello from "+r.URL.Path)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func get(t *testing.T, h http.Handler, host, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "http://"+host+path, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestARequestReachesTheAppItNames(t *testing.T) {
	app := backend(t)
	resolver := &fakeResolver{apps: map[string]string{"shop": strings.TrimPrefix(app.URL, "http://")}}
	p := New(resolver, "localhost", nil)

	rec := get(t, p, "shop.localhost:8081", "/cart")

	if rec.Code != http.StatusOK || rec.Body.String() != "hello from /cart" {
		t.Fatalf("status %d, body %q", rec.Code, rec.Body)
	}
	if got := rec.Header().Get("X-Seen-Host"); got != "shop.localhost:8081" {
		t.Errorf("the app saw Host %q, want the address the browser used", got)
	}
}

func TestUnknownAppsGetANotFoundPage(t *testing.T) {
	p := New(&fakeResolver{}, "localhost", nil)

	rec := get(t, p, "nothing.localhost:8081", "/")

	if rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), "nothing.localhost") {
		t.Fatalf("status %d, body %q", rec.Code, rec.Body)
	}
}

func TestASuspendedAppGetsASuspendedPage(t *testing.T) {
	p := New(&fakeResolver{err: map[string]error{"shop": ErrStopped}}, "localhost", nil)

	rec := get(t, p, "shop.localhost", "/")

	if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "suspended") {
		t.Fatalf("status %d, body %q", rec.Code, rec.Body)
	}
}

func TestAddressesThatNameNoAppAreNotLookedUp(t *testing.T) {
	resolver := &fakeResolver{}
	p := New(resolver, "localhost", nil)

	for _, host := range []string{"localhost", "localhost:8081", "127.0.0.1:8081", "a.b.localhost", "-bad.localhost", "shop.example.com", ""} {
		if rec := get(t, p, host, "/"); rec.Code != http.StatusNotFound {
			t.Errorf("host %q: status %d, want 404", host, rec.Code)
		}
	}
	if n := resolver.lookups(); n != 0 {
		t.Errorf("%d lookups for addresses that name no app", n)
	}
}

func TestHostMatchingIsCaseInsensitive(t *testing.T) {
	app := backend(t)
	p := New(&fakeResolver{apps: map[string]string{"shop": strings.TrimPrefix(app.URL, "http://")}}, "localhost", nil)

	if rec := get(t, p, "SHOP.Localhost:8081", "/"); rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestLookupsAreRememberedBriefly(t *testing.T) {
	app := backend(t)
	resolver := &fakeResolver{apps: map[string]string{"shop": strings.TrimPrefix(app.URL, "http://")}}
	p := New(resolver, "localhost", nil)
	now := time.Now()
	p.now = func() time.Time { return now }

	get(t, p, "shop.localhost", "/")
	get(t, p, "shop.localhost", "/")
	if n := resolver.lookups(); n != 1 {
		t.Fatalf("lookups = %d, want 1 within the cache window", n)
	}

	now = now.Add(cacheTTL + time.Second)
	get(t, p, "shop.localhost", "/")
	if n := resolver.lookups(); n != 2 {
		t.Fatalf("lookups = %d, want a fresh one after the window", n)
	}
}

func TestADockerFailureIsNotRemembered(t *testing.T) {
	resolver := &fakeResolver{err: map[string]error{"shop": errors.New("docker is not running")}}
	p := New(resolver, "localhost", nil)

	rec := get(t, p, "shop.localhost", "/")
	get(t, p, "shop.localhost", "/")

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status %d, want 502", rec.Code)
	}
	if n := resolver.lookups(); n != 2 {
		t.Fatalf("lookups = %d, want every request to try again", n)
	}
}

func TestAnAppThatMovedIsFoundAgain(t *testing.T) {
	old := backend(t)
	oldAddr := strings.TrimPrefix(old.URL, "http://")
	resolver := &fakeResolver{apps: map[string]string{"shop": oldAddr}}
	p := New(resolver, "localhost", nil)

	if rec := get(t, p, "shop.localhost", "/"); rec.Code != http.StatusOK {
		t.Fatalf("first request: status %d", rec.Code)
	}

	// Docker restarts the container on another port; the old one is gone.
	old.Close()
	moved := backend(t)
	resolver.mu.Lock()
	resolver.apps["shop"] = strings.TrimPrefix(moved.URL, "http://")
	resolver.mu.Unlock()

	if rec := get(t, p, "shop.localhost", "/"); rec.Code != http.StatusBadGateway {
		t.Fatalf("request to the gone port: status %d, want 502", rec.Code)
	}
	if rec := get(t, p, "shop.localhost", "/"); rec.Code != http.StatusOK {
		t.Fatalf("next request: status %d, want it to reach the new port", rec.Code)
	}
}

func TestPageTextIsEscaped(t *testing.T) {
	rec := httptest.NewRecorder()
	page(rec, http.StatusNotFound, "<b>x</b>", "ok")
	if strings.Contains(rec.Body.String(), "<b>x</b>") {
		t.Fatal("title was not escaped")
	}
}
