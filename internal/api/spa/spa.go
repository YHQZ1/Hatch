// Package spa serves a built single-page app, such as the Hatch web UI.
package spa

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// contentSecurityPolicy limits the UI to its own origin, plus GitHub avatars
// (github.com/<user>.png redirects to avatars.githubusercontent.com). Styles
// allow inline attributes because components set style props.
const contentSecurityPolicy = "default-src 'self'; " +
	"script-src 'self'; " +
	"style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data: https://github.com https://avatars.githubusercontent.com; " +
	"font-src 'self'; " +
	"connect-src 'self'; " +
	"object-src 'none'; " +
	"base-uri 'self'; " +
	"form-action 'self'; " +
	"frame-ancestors 'none'"

// Handler serves files from fsys. A path with no matching file gets
// index.html instead, so client-side routes work when the page is reloaded.
// Requests under /api/ and /ws/ that match no route get a JSON 404 rather than
// the app, and so do non-GET requests.
func Handler(fsys fs.FS) http.Handler {
	return &handler{fsys: fsys}
}

type handler struct {
	fsys fs.FS
}

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if (r.Method != http.MethodGet && r.Method != http.MethodHead) ||
		strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/ws/") {
		writeJSONError(w, http.StatusNotFound, "not found")
		return
	}

	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if name == "" {
		name = "index.html"
	}

	if info, err := fs.Stat(h.fsys, name); err == nil && !info.IsDir() && name != "index.html" {
		if strings.HasPrefix(name, "assets/") {
			// Built asset names contain a content hash.
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		http.ServeFileFS(w, r, h.fsys, name)
		return
	}

	h.serveIndex(w, r)
}

func (h *handler) serveIndex(w http.ResponseWriter, r *http.Request) {
	if _, err := fs.Stat(h.fsys, "index.html"); err != nil {
		http.Error(w, "The Hatch web UI is not built into this binary. Run `make web` and rebuild.",
			http.StatusServiceUnavailable)
		return
	}

	header := w.Header()
	header.Set("Cache-Control", "no-cache")
	header.Set("Content-Security-Policy", contentSecurityPolicy)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("X-Frame-Options", "DENY")
	header.Set("Referrer-Policy", "strict-origin-when-cross-origin")

	// ServeFileFS would redirect a request ending in /index.html, so serve the
	// file's bytes directly with the right type.
	data, err := fs.ReadFile(h.fsys, "index.html")
	if err != nil {
		http.Error(w, "failed to read the web UI", http.StatusInternalServerError)
		return
	}
	header.Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write(data)
	}
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
