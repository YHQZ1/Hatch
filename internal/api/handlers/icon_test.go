package handlers

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/YHQZ1/hatch/internal/proxy"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
)

// png is the smallest valid PNG: enough for the bytes to be recognised as one.
var png = []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89")

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>`

type apps map[string]string

func (a apps) Resolve(_ context.Context, sub string) (string, error) {
	if addr, ok := a[sub]; ok {
		return addr, nil
	}
	return "", proxy.ErrNotFound
}

// site serves the given paths; a path's value is its content type and body,
// separated by "|". Paths it does not know are 404.
func site(t *testing.T, routes map[string]string) (addr string, hits *atomic.Int64) {
	t.Helper()
	hits = &atomic.Int64{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		route, ok := routes[r.URL.Path]
		if !ok {
			http.NotFound(w, r)
			return
		}
		contentType, body, _ := strings.Cut(route, "|")
		w.Header().Set("Content-Type", contentType)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return strings.TrimPrefix(srv.URL, "http://"), hits
}

func page(head string) string {
	return "text/html; charset=utf-8|<!doctype html><html><head>" + head + "</head><body>hello</body></html>"
}

func getIcon(t *testing.T, f projectFixture, resolver proxy.Resolver) *httptest.ResponseRecorder {
	t.Helper()
	return f.call(t, NewIconHandler(f.pool, resolver).Get)
}

func TestTheProjectIconIsTheOneItsPageDeclares(t *testing.T) {
	f := newProjectFixture(t, "active")
	addr, _ := site(t, map[string]string{
		"/":                page(`<link rel="icon" href="/static/logo.png">`),
		"/static/logo.png": "image/png|" + string(png),
	})

	rec := getIcon(t, f, apps{"shop": addr})

	if rec.Code != http.StatusOK || !bytes.Equal(rec.Body.Bytes(), png) {
		t.Fatalf("status %d, %d bytes", rec.Code, rec.Body.Len())
	}
	if got := rec.Header().Get("Content-Type"); got != "image/png" {
		t.Errorf("Content-Type = %q", got)
	}
	if rec.Header().Get("Content-Security-Policy") == "" || rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Error("the app-supplied icon is served without its safety headers")
	}
	if !strings.Contains(rec.Header().Get("Cache-Control"), "max-age=600") {
		t.Errorf("Cache-Control = %q", rec.Header().Get("Cache-Control"))
	}
}

func TestAVectorIconBeatsARasterOne(t *testing.T) {
	f := newProjectFixture(t, "active")
	addr, _ := site(t, map[string]string{
		"/":         page(`<link rel="icon" sizes="192x192" href="/big.png"><link rel="icon" type="image/svg+xml" href="/icon.svg">`),
		"/big.png":  "image/png|" + string(png),
		"/icon.svg": "image/svg+xml|" + svg,
	})

	rec := getIcon(t, f, apps{"shop": addr})

	if rec.Header().Get("Content-Type") != "image/svg+xml" {
		t.Fatalf("Content-Type = %q, want the SVG", rec.Header().Get("Content-Type"))
	}
}

func TestWithoutADeclaredIconTheConventionalFileIsTried(t *testing.T) {
	f := newProjectFixture(t, "active")
	addr, _ := site(t, map[string]string{
		"/":            page(`<title>no icon declared</title>`),
		"/favicon.ico": "image/x-icon|" + string(png),
	})

	rec := getIcon(t, f, apps{"shop": addr})

	if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != "image/x-icon" {
		t.Fatalf("status %d, Content-Type %q", rec.Code, rec.Header().Get("Content-Type"))
	}
}

func TestAnInlineIconIsDecoded(t *testing.T) {
	f := newProjectFixture(t, "active")
	addr, _ := site(t, map[string]string{
		"/": page(`<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E">`),
	})

	rec := getIcon(t, f, apps{"shop": addr})

	if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != "image/svg+xml" || !strings.Contains(rec.Body.String(), "<svg") {
		t.Fatalf("status %d, Content-Type %q, body %q", rec.Code, rec.Header().Get("Content-Type"), rec.Body)
	}
}

func TestAnIconOnAnotherHostIsNeverFetched(t *testing.T) {
	f := newProjectFixture(t, "active")
	elsewhere, elsewhereHits := site(t, map[string]string{"/secret.png": "image/png|" + string(png)})
	addr, _ := site(t, map[string]string{
		"/": page(`<link rel="icon" href="http://` + elsewhere + `/secret.png"><link rel="icon" href="//` + elsewhere + `/secret.png">`),
	})

	rec := getIcon(t, f, apps{"shop": addr})

	if elsewhereHits.Load() != 0 {
		t.Fatalf("Hatch fetched from another address %d times because a page asked it to", elsewhereHits.Load())
	}
	if rec.Code != http.StatusNotFound {
		t.Errorf("status %d, want 404", rec.Code)
	}
}

func TestARedirectAwayFromTheAppIsNotFollowed(t *testing.T) {
	f := newProjectFixture(t, "active")
	elsewhere, elsewhereHits := site(t, map[string]string{"/x.png": "image/png|" + string(png)})
	app := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte(`<head><link rel="icon" href="/go"></head>`))
			return
		}
		http.Redirect(w, r, "http://"+elsewhere+"/x.png", http.StatusFound)
	}))
	t.Cleanup(app.Close)

	rec := getIcon(t, f, apps{"shop": strings.TrimPrefix(app.URL, "http://")})

	if elsewhereHits.Load() != 0 || rec.Code != http.StatusNotFound {
		t.Fatalf("redirect followed %d times, status %d", elsewhereHits.Load(), rec.Code)
	}
}

func TestThingsThatAreNotImagesAreNotIcons(t *testing.T) {
	f := newProjectFixture(t, "active")
	addr, _ := site(t, map[string]string{
		"/":             page(`<link rel="icon" href="/not-an-image">`),
		"/not-an-image": "text/html|<html>not an image</html>",
	})

	if rec := getIcon(t, f, apps{"shop": addr}); rec.Code != http.StatusNotFound {
		t.Fatalf("status %d, want 404", rec.Code)
	}
}

func TestAnOversizedIconIsRejected(t *testing.T) {
	f := newProjectFixture(t, "active")
	addr, _ := site(t, map[string]string{
		"/":         page(`<link rel="icon" href="/huge.png">`),
		"/huge.png": "image/png|" + string(png) + strings.Repeat("x", maxIconBytes),
	})

	if rec := getIcon(t, f, apps{"shop": addr}); rec.Code != http.StatusNotFound {
		t.Fatalf("status %d, want 404", rec.Code)
	}
}

func TestAnAppWithNoIconGetsA404ThatIsRememberedBriefly(t *testing.T) {
	f := newProjectFixture(t, "active")
	addr, _ := site(t, map[string]string{"/": page(`<title>plain</title>`)})

	rec := getIcon(t, f, apps{"shop": addr})

	if rec.Code != http.StatusNotFound || rec.Header().Get("Cache-Control") != "private, max-age=60" {
		t.Fatalf("status %d, Cache-Control %q", rec.Code, rec.Header().Get("Cache-Control"))
	}
}

func TestABackendThatServesNoHTMLHasNoIcon(t *testing.T) {
	f := newProjectFixture(t, "active")
	addr, _ := site(t, map[string]string{"/": "application/json|{\"ok\":true}"})

	if rec := getIcon(t, f, apps{"shop": addr}); rec.Code != http.StatusNotFound {
		t.Fatalf("status %d, want 404", rec.Code)
	}
}

func TestNoIconWhenHatchCannotReachTheApp(t *testing.T) {
	f := newProjectFixture(t, "active")

	if rec := getIcon(t, f, nil); rec.Code != http.StatusNotFound {
		t.Errorf("without a resolver: status %d, want 404", rec.Code)
	}
	if rec := getIcon(t, f, apps{}); rec.Code != http.StatusNotFound {
		t.Errorf("for an app that is not running: status %d, want 404", rec.Code)
	}
}

func TestAnotherUsersProjectIconIsNotServed(t *testing.T) {
	f := newProjectFixture(t, "active")
	addr, hits := site(t, map[string]string{"/": page(`<link rel="icon" href="/a.png">`), "/a.png": "image/png|" + string(png)})
	other, err := f.q.CreateUser(context.Background(), dbpkg.CreateUserParams{GithubID: 2, GithubUsername: "intruder", AccessToken: "x"})
	if err != nil {
		t.Fatal(err)
	}
	f.user = other

	rec := getIcon(t, f, apps{"shop": addr})

	if rec.Code != http.StatusNotFound || hits.Load() != 0 {
		t.Fatalf("status %d, app asked %d times", rec.Code, hits.Load())
	}
}

func TestDeclaredIconsAreOrderedBestFirst(t *testing.T) {
	got := declaredIcons([]byte(`<html><head>
		<link rel="stylesheet" href="/app.css">
		<link rel="icon" sizes="16x16" href="/16.png">
		<link rel="shortcut icon" href="/favicon.ico">
		<link rel="apple-touch-icon" href="/touch.png">
		<link rel="icon" sizes="32x32 64x64" href="/64.png">
		<link rel="icon" href="/logo.svg">
	</head><body><link rel="icon" href="/ignored.png"></body></html>`))

	want := []string{"/logo.svg", "/touch.png", "/64.png", "/16.png", "/favicon.ico"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("order = %v, want %v", got, want)
	}
}
