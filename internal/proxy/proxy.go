// Package proxy serves the apps of the local target. A request for
// <subdomain>.localhost reaches the container of the app with that subdomain
// (ADR 0018).
//
// The proxy keeps no routes of its own. It asks a Resolver where an app is and
// remembers the answer for a few seconds, so a restarted Hatch, or a container
// Docker restarted on a new port, is found again without any bookkeeping.
package proxy

import (
	"context"
	"errors"
	"fmt"
	"html"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

var (
	// ErrNotFound means no app has the subdomain.
	ErrNotFound = errors.New("no app with that subdomain")
	// ErrStopped means the app exists but is paused or not running.
	ErrStopped = errors.New("the app is not running")
)

// Resolver finds the address (host:port) an app listens on.
type Resolver interface {
	Resolve(ctx context.Context, subdomain string) (addr string, err error)
}

// cacheTTL is how long a lookup is reused.
const cacheTTL = 3 * time.Second

var labelPattern = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

type lookup struct {
	addr    string
	err     error
	expires time.Time
}

// Proxy is an http.Handler that forwards <subdomain>.<domain> to the app.
type Proxy struct {
	resolver Resolver
	domain   string
	now      func() time.Time
	stats    *Stats

	mu    sync.Mutex
	cache map[string]lookup
}

// New returns a proxy for apps at <subdomain>.<domain>, for example
// "localhost". When stats is not nil it counts every request that reaches an
// app.
func New(resolver Resolver, domain string, stats *Stats) *Proxy {
	return &Proxy{
		resolver: resolver,
		domain:   strings.ToLower(strings.Trim(domain, ".")),
		now:      time.Now,
		stats:    stats,
		cache:    map[string]lookup{},
	}
}

// subdomainOf returns the app a Host header names, or "" when it names none.
func (p *Proxy) subdomainOf(host string) string {
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	sub, ok := strings.CutSuffix(host, "."+p.domain)
	if !ok || !labelPattern.MatchString(sub) {
		return ""
	}
	return sub
}

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	sub := p.subdomainOf(r.Host)
	if sub == "" {
		page(w, http.StatusNotFound, "Not an app address",
			fmt.Sprintf("This is Hatch's app proxy. Apps are served at <code>&lt;name&gt;.%s</code>.", html.EscapeString(p.domain)))
		return
	}

	addr, err := p.resolve(r.Context(), sub)
	switch {
	case errors.Is(err, ErrNotFound):
		page(w, http.StatusNotFound, "No app here",
			fmt.Sprintf("Nothing is deployed at <code>%s</code>.", html.EscapeString(sub+"."+p.domain)))
		return
	case errors.Is(err, ErrStopped):
		page(w, http.StatusServiceUnavailable, "App suspended",
			fmt.Sprintf("<code>%s</code> is suspended. Resume it in Hatch to bring it back.", html.EscapeString(sub+"."+p.domain)))
		return
	case err != nil:
		slog.WarnContext(r.Context(), "app lookup failed", "subdomain", sub, "error", err)
		page(w, http.StatusBadGateway, "Hatch could not find the app", "Looking up the app in Docker failed. Is Docker running?")
		return
	}

	if p.stats != nil {
		rec := &recorder{ResponseWriter: w, start: time.Now(), status: http.StatusOK}
		w = rec
		defer func() {
			if !rec.wrote { // hijacked (a WebSocket) or answered with nothing
				rec.ttfb = time.Since(rec.start)
			}
			p.stats.Record(sub, rec.status, rec.ttfb)
		}()
	}

	target := &url.URL{Scheme: "http", Host: addr}
	(&httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(target)
			pr.Out.Host = pr.In.Host
			pr.SetXForwarded()
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			// The container may have moved or stopped since the lookup.
			p.forget(sub)
			slog.WarnContext(r.Context(), "app did not answer", "subdomain", sub, "error", err)
			page(w, http.StatusBadGateway, "App not responding",
				fmt.Sprintf("<code>%s</code> is not answering. It may still be starting.", html.EscapeString(sub+"."+p.domain)))
		},
	}).ServeHTTP(w, r)
}

func (p *Proxy) resolve(ctx context.Context, sub string) (string, error) {
	p.mu.Lock()
	cached, ok := p.cache[sub]
	p.mu.Unlock()
	if ok && p.now().Before(cached.expires) {
		return cached.addr, cached.err
	}

	addr, err := p.resolver.Resolve(ctx, sub)
	// Only answers about the app are remembered; a failed lookup of Docker
	// itself is tried again at once.
	if err == nil || errors.Is(err, ErrNotFound) || errors.Is(err, ErrStopped) {
		p.mu.Lock()
		p.cache[sub] = lookup{addr: addr, err: err, expires: p.now().Add(cacheTTL)}
		p.mu.Unlock()
	}
	return addr, err
}

func (p *Proxy) forget(sub string) {
	p.mu.Lock()
	delete(p.cache, sub)
	p.mu.Unlock()
}

func page(w http.ResponseWriter, status int, title, body string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	fmt.Fprintf(w, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>%s</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222"><h1 style="font-size:1.25rem">%s</h1><p>%s</p></body>`,
		html.EscapeString(title), html.EscapeString(title), body)
}
