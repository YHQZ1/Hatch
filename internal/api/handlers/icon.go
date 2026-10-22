package handlers

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/net/html"

	"github.com/YHQZ1/hatch/internal/proxy"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
)

const (
	// maxIconBytes bounds an icon, and maxPageBytes the page searched for one.
	maxIconBytes = 256 << 10
	maxPageBytes = 512 << 10
	// iconCandidates is how many of a page's declared icons are tried.
	iconCandidates = 3
)

// IconHandler serves a project's icon: the icon of the site it runs, as the
// page itself declares it. The console shows it next to the project and falls
// back to Hatch's mark when there is none (a backend with no pages, say).
type IconHandler struct {
	queries *dbpkg.Queries
	// resolver finds where a running app listens; nil when Hatch cannot reach
	// the apps it runs (the AWS target), in which case no project has an icon.
	resolver proxy.Resolver
	client   *http.Client
}

func NewIconHandler(pool *pgxpool.Pool, resolver proxy.Resolver) *IconHandler {
	return &IconHandler{
		queries:  dbpkg.New(pool),
		resolver: resolver,
		client:   &http.Client{Timeout: 3 * time.Second},
	}
}

// Get answers with the icon's bytes, or 404 when the project has none. The
// console adds ?v=<deployment id>, so a redeploy asks again; the browser keeps
// each answer for a while, so the app is not asked on every page load.
func (h *IconHandler) Get(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	project, err := h.queries.GetProjectByIDAndUserID(c.Request.Context(), dbpkg.GetProjectByIDAndUserIDParams{ID: id, UserID: userID})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	icon, ok := h.iconOf(c.Request.Context(), project)
	if !ok {
		c.Header("Cache-Control", "private, max-age=60")
		c.JSON(http.StatusNotFound, gin.H{"error": "no icon"})
		return
	}
	c.Header("Cache-Control", "private, max-age=600")
	// The icon is app-supplied. It is only ever shown through <img>, where an
	// SVG cannot run script; these headers keep it inert if opened directly.
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
	c.Data(http.StatusOK, icon.contentType, icon.data)
}

type icon struct {
	contentType string
	data        []byte
}

func (h *IconHandler) iconOf(ctx context.Context, project dbpkg.Project) (icon, bool) {
	if h.resolver == nil || project.Subdomain == nil || *project.Subdomain == "" {
		return icon{}, false
	}
	addr, err := h.resolver.Resolve(ctx, *project.Subdomain)
	if err != nil {
		return icon{}, false
	}
	base := &url.URL{Scheme: "http", Host: addr, Path: "/"}

	if page, ok := h.fetchPage(ctx, base); ok {
		refs := declaredIcons(page)
		if len(refs) > iconCandidates {
			refs = refs[:iconCandidates]
		}
		for _, ref := range refs {
			if got, ok := h.load(ctx, base, ref); ok {
				return got, true
			}
		}
	}
	// A site that declares nothing may still have the conventional file.
	return h.load(ctx, base, "/favicon.ico")
}

// fetchPage returns the app's home page, if it is HTML.
func (h *IconHandler) fetchPage(ctx context.Context, base *url.URL) ([]byte, bool) {
	body, contentType, ok := h.get(ctx, base, base.String(), maxPageBytes)
	if !ok {
		return nil, false
	}
	if mediaType, _, err := mime.ParseMediaType(contentType); err != nil || mediaType != "text/html" {
		return nil, false
	}
	return body, true
}

// load fetches one declared icon: a data: URL, or a path on the app itself.
// Anything that points elsewhere is ignored, so a page cannot make Hatch fetch
// from an address of its choosing.
func (h *IconHandler) load(ctx context.Context, base *url.URL, ref string) (icon, bool) {
	ref = strings.TrimSpace(ref)
	if strings.HasPrefix(strings.ToLower(ref), "data:") {
		return decodeDataURL(ref)
	}
	target, err := base.Parse(ref)
	if err != nil || target.Host != base.Host || target.Scheme != "http" {
		return icon{}, false
	}
	body, contentType, ok := h.get(ctx, base, target.String(), maxIconBytes)
	if !ok {
		return icon{}, false
	}
	return asIcon(contentType, body)
}

// get fetches rawURL from the app, reading at most limit bytes. Redirects are
// followed only while they stay on the app.
func (h *IconHandler) get(ctx context.Context, base *url.URL, rawURL string, limit int64) ([]byte, string, bool) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, "", false
	}
	client := *h.client
	client.CheckRedirect = func(next *http.Request, via []*http.Request) error {
		if next.URL.Host != base.Host || len(via) >= 3 {
			return errors.New("redirect leaves the app")
		}
		return nil
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, "", false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", false
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil || int64(len(data)) > limit {
		return nil, "", false
	}
	return data, resp.Header.Get("Content-Type"), true
}

// asIcon accepts bytes that are an image, by the app's declared type or, when
// it declares none that helps, by what the bytes look like.
func asIcon(declared string, data []byte) (icon, bool) {
	if len(data) == 0 {
		return icon{}, false
	}
	mediaType, _, err := mime.ParseMediaType(declared)
	if err != nil || !strings.HasPrefix(mediaType, "image/") {
		mediaType = http.DetectContentType(data)
		if !strings.HasPrefix(mediaType, "image/") {
			return icon{}, false
		}
	}
	return icon{contentType: mediaType, data: data}, true
}

// decodeDataURL reads an inline icon such as <link rel="icon" href="data:...">.
func decodeDataURL(raw string) (icon, bool) {
	rest := raw[len("data:"):]
	meta, payload, found := strings.Cut(rest, ",")
	if !found {
		return icon{}, false
	}
	base64Encoded := strings.HasSuffix(strings.ToLower(meta), ";base64")
	mediaType, _, _ := strings.Cut(meta, ";")
	var data []byte
	if base64Encoded {
		decoded, err := base64.StdEncoding.DecodeString(payload)
		if err != nil {
			return icon{}, false
		}
		data = decoded
	} else {
		text, err := url.PathUnescape(payload)
		if err != nil {
			return icon{}, false
		}
		data = []byte(text)
	}
	if len(data) > maxIconBytes || !strings.HasPrefix(strings.ToLower(mediaType), "image/") {
		return icon{}, false
	}
	return icon{contentType: strings.ToLower(mediaType), data: data}, true
}

// declaredIcons lists the icons an HTML page declares with <link>, best first:
// vector icons, then the largest raster ones.
func declaredIcons(page []byte) []string {
	type candidate struct {
		href  string
		score int
	}
	var found []candidate

	tokens := html.NewTokenizer(strings.NewReader(string(page)))
	for {
		kind := tokens.Next()
		if kind == html.ErrorToken {
			break
		}
		if kind != html.StartTagToken && kind != html.SelfClosingTagToken {
			continue
		}
		name, hasAttr := tokens.TagName()
		if string(name) == "body" {
			break // icons are declared in the head
		}
		if string(name) != "link" || !hasAttr {
			continue
		}
		attrs := map[string]string{}
		for {
			key, value, more := tokens.TagAttr()
			attrs[strings.ToLower(string(key))] = string(value)
			if !more {
				break
			}
		}
		rel := strings.ToLower(attrs["rel"])
		href := strings.TrimSpace(attrs["href"])
		if href == "" || !(strings.Contains(rel, "icon")) {
			continue
		}
		found = append(found, candidate{href: href, score: iconScore(rel, href, attrs["type"], attrs["sizes"])})
	}

	sort.SliceStable(found, func(i, j int) bool { return found[i].score > found[j].score })
	hrefs := make([]string, 0, len(found))
	for _, f := range found {
		hrefs = append(hrefs, f.href)
	}
	return hrefs
}

func iconScore(rel, href, mediaType, sizes string) int {
	lower := strings.ToLower(href)
	if strings.Contains(strings.ToLower(mediaType), "svg") || strings.HasSuffix(lower, ".svg") || strings.HasPrefix(lower, "data:image/svg") {
		return 1_000_000
	}
	// "32x32 64x64" or "any": the largest side declared.
	best := 0
	for _, size := range strings.Fields(strings.ToLower(sizes)) {
		w, _, ok := strings.Cut(size, "x")
		if !ok {
			continue
		}
		if n, err := strconv.Atoi(w); err == nil && n > best {
			best = n
		}
	}
	if best == 0 && strings.Contains(rel, "apple-touch-icon") {
		best = 180 // the size iOS asks for
	}
	return best
}
