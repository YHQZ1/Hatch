package spa

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func testFS() fstest.MapFS {
	return fstest.MapFS{
		"index.html":           {Data: []byte("<html>app</html>")},
		"assets/app-abc123.js": {Data: []byte("console.log('app')")},
		"hatch.svg":            {Data: []byte("<svg/>")},
	}
}

func serve(t *testing.T, h http.Handler, method, target string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, target, nil))
	return rec
}

func TestServesIndexAtRoot(t *testing.T) {
	rec := serve(t, Handler(testFS()), http.MethodGet, "/")
	if rec.Code != http.StatusOK || rec.Body.String() != "<html>app</html>" {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "text/html") {
		t.Fatalf("Content-Type = %q", got)
	}
	if rec.Header().Get("Cache-Control") != "no-cache" {
		t.Fatalf("Cache-Control = %q", rec.Header().Get("Cache-Control"))
	}
}

func TestClientRouteFallsBackToIndex(t *testing.T) {
	for _, target := range []string{"/console", "/projects/abc/settings", "/auth/success", "/missing.png"} {
		rec := serve(t, Handler(testFS()), http.MethodGet, target)
		if rec.Code != http.StatusOK || rec.Body.String() != "<html>app</html>" {
			t.Fatalf("%s: got %d %q", target, rec.Code, rec.Body.String())
		}
	}
}

func TestIndexResponsesCarrySecurityHeaders(t *testing.T) {
	rec := serve(t, Handler(testFS()), http.MethodGet, "/console")
	for header, want := range map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"Referrer-Policy":        "strict-origin-when-cross-origin",
	} {
		if got := rec.Header().Get(header); got != want {
			t.Errorf("%s = %q, want %q", header, got, want)
		}
	}
	csp := rec.Header().Get("Content-Security-Policy")
	for _, directive := range []string{
		"default-src 'self'",
		"script-src 'self'",
		"img-src 'self' data: https://github.com https://avatars.githubusercontent.com",
		"frame-ancestors 'none'",
	} {
		if !strings.Contains(csp, directive) {
			t.Errorf("Content-Security-Policy %q lacks %q", csp, directive)
		}
	}
}

func TestHashedAssetsAreCachedForever(t *testing.T) {
	rec := serve(t, Handler(testFS()), http.MethodGet, "/assets/app-abc123.js")
	if rec.Code != http.StatusOK || rec.Body.String() != "console.log('app')" {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("Cache-Control = %q", got)
	}
}

func TestOtherFilesAreServedWithoutLongCaching(t *testing.T) {
	rec := serve(t, Handler(testFS()), http.MethodGet, "/hatch.svg")
	if rec.Code != http.StatusOK || rec.Body.String() != "<svg/>" {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-cache" {
		t.Fatalf("Cache-Control = %q", got)
	}
}

func TestUnknownAPIAndWebSocketPathsGetJSON404(t *testing.T) {
	for _, target := range []string{"/api/nope", "/api/", "/ws/deployments/1"} {
		rec := serve(t, Handler(testFS()), http.MethodGet, target)
		if rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), `"error"`) {
			t.Fatalf("%s: got %d %q", target, rec.Code, rec.Body.String())
		}
		if got := rec.Header().Get("Content-Type"); got != "application/json" {
			t.Fatalf("%s: Content-Type = %q", target, got)
		}
	}
}

func TestNonGetRequestsGet404(t *testing.T) {
	rec := serve(t, Handler(testFS()), http.MethodPost, "/console")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("POST got %d", rec.Code)
	}
}

func TestHeadRequestHasNoBody(t *testing.T) {
	rec := serve(t, Handler(testFS()), http.MethodHead, "/console")
	if rec.Code != http.StatusOK || rec.Body.Len() != 0 {
		t.Fatalf("HEAD got %d with %d body bytes", rec.Code, rec.Body.Len())
	}
}

func TestPathTraversalIsContained(t *testing.T) {
	rec := serve(t, Handler(testFS()), http.MethodGet, "/../../etc/passwd")
	if rec.Code != http.StatusOK || rec.Body.String() != "<html>app</html>" {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
}

func TestReportsAnUnbuiltUI(t *testing.T) {
	rec := serve(t, Handler(fstest.MapFS{".gitkeep": {}}), http.MethodGet, "/")
	if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "make web") {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
}
