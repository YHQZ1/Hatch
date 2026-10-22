package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
)

// fakeGitHubAPI answers the installation endpoints the way api.github.com
// does, and records which paths were asked for.
type fakeGitHubAPI struct {
	server *httptest.Server
	// installations is the account each installation belongs to.
	installations []Installation
	// repos holds each installation's repositories.
	repos map[int64][]Repo
	// status, when set, is returned for every request instead of data.
	status int

	mu    sync.Mutex
	calls []string
}

func newFakeGitHubAPI(t *testing.T) *fakeGitHubAPI {
	t.Helper()
	f := &fakeGitHubAPI{repos: map[int64][]Repo{}}
	mux := http.NewServeMux()
	mux.HandleFunc("/user/installations", func(w http.ResponseWriter, r *http.Request) {
		if !f.begin(w, r) {
			return
		}
		type account struct {
			Login string `json:"login"`
			Type  string `json:"type"`
		}
		type item struct {
			ID      int64   `json:"id"`
			Account account `json:"account"`
		}
		var items []item
		for _, installation := range paged(f.installations, r) {
			items = append(items, item{ID: installation.ID, Account: account{Login: installation.Account, Type: installation.Type}})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"total_count": len(f.installations), "installations": items})
	})
	mux.HandleFunc("/user/installations/{id}/repositories", func(w http.ResponseWriter, r *http.Request) {
		if !f.begin(w, r) {
			return
		}
		id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"total_count":  len(f.repos[id]),
			"repositories": paged(f.repos[id], r),
		})
	})
	f.server = httptest.NewServer(mux)
	t.Cleanup(f.server.Close)
	return f
}

// begin records the request and applies the fake's failure mode. It reports
// whether the handler should go on to answer.
func (f *fakeGitHubAPI) begin(w http.ResponseWriter, r *http.Request) bool {
	f.mu.Lock()
	f.calls = append(f.calls, r.URL.Path+"?"+r.URL.RawQuery)
	f.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	if r.Header.Get("Authorization") != "Bearer user-token" {
		w.WriteHeader(http.StatusUnauthorized)
		return false
	}
	if f.status != 0 {
		w.WriteHeader(f.status)
		return false
	}
	return true
}

// paged returns the slice of items GitHub would return for ?page and ?per_page.
func paged[T any](items []T, r *http.Request) []T {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	size, _ := strconv.Atoi(r.URL.Query().Get("per_page"))
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 30
	}
	start := min((page-1)*size, len(items))
	end := min(start+size, len(items))
	return items[start:end]
}

func (f *fakeGitHubAPI) called(substr string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, call := range f.calls {
		if strings.Contains(call, substr) {
			n++
		}
	}
	return n
}

func listRepos(t *testing.T, f *fakeGitHubAPI, token string, hasToken bool) (int, reposResponse) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	h := NewGitHubHandler(nil)
	h.apiURL = f.server.URL
	h.token = func(*gin.Context) (string, bool) { return token, hasToken }
	router := gin.New()
	router.GET("/repos", h.ListRepos)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest("GET", "/repos", nil))

	var body reposResponse
	if rec.Code == http.StatusOK {
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode %s: %v", rec.Body, err)
		}
		// The UI maps over these, so they must be arrays, never null.
		if !strings.Contains(rec.Body.String(), `"repos":[`) || !strings.Contains(rec.Body.String(), `"installations":[`) {
			t.Fatalf("repos and installations must be JSON arrays: %s", rec.Body)
		}
	}
	return rec.Code, body
}

func TestListReposBeforeTheAppIsInstalled(t *testing.T) {
	f := newFakeGitHubAPI(t)

	status, body := listRepos(t, f, "user-token", true)

	if status != http.StatusOK {
		t.Fatalf("status = %d", status)
	}
	if body.Installed || len(body.Repos) != 0 || len(body.Installations) != 0 {
		t.Fatalf("body = %+v, want not installed and empty", body)
	}
}

func TestListReposReadsOnlyWhatTheAppWasGranted(t *testing.T) {
	f := newFakeGitHubAPI(t)
	f.installations = []Installation{{ID: 1, Account: "octocat", Type: "User"}, {ID: 2, Account: "acme", Type: "Organization"}}
	f.repos[1] = []Repo{
		{ID: 10, FullName: "octocat/old", UpdatedAt: "2026-01-01T00:00:00Z"},
		{ID: 11, FullName: "octocat/new", UpdatedAt: "2026-09-01T00:00:00Z", DefaultBranch: "main"},
	}
	f.repos[2] = []Repo{
		{ID: 20, FullName: "acme/api", UpdatedAt: "2026-05-01T00:00:00Z"},
		{ID: 11, FullName: "octocat/new", UpdatedAt: "2026-09-01T00:00:00Z"}, // reachable through both
	}

	status, body := listRepos(t, f, "user-token", true)

	if status != http.StatusOK || !body.Installed {
		t.Fatalf("status = %d, installed = %v", status, body.Installed)
	}
	var names []string
	for _, repo := range body.Repos {
		names = append(names, repo.FullName)
	}
	if got, want := strings.Join(names, ","), "octocat/new,acme/api,octocat/old"; got != want {
		t.Fatalf("repos = %s, want %s (newest first, no duplicates)", got, want)
	}
	if body.Repos[0].DefaultBranch != "main" {
		t.Errorf("default branch = %q, want it passed through", body.Repos[0].DefaultBranch)
	}
	if len(body.Installations) != 2 || body.Installations[1].Account != "acme" || body.Installations[1].Type != "Organization" {
		t.Errorf("installations = %+v", body.Installations)
	}
	// Never the broad endpoint that lists everything the user can reach.
	if n := f.called("/user/repos"); n != 0 {
		t.Errorf("/user/repos was called %d times", n)
	}
}

func TestListReposReadsEveryPage(t *testing.T) {
	f := newFakeGitHubAPI(t)
	f.installations = []Installation{{ID: 1, Account: "octocat", Type: "User"}}
	for i := range 230 {
		f.repos[1] = append(f.repos[1], Repo{ID: int64(i + 1), FullName: fmt.Sprintf("octocat/r%03d", i)})
	}

	status, body := listRepos(t, f, "user-token", true)

	if status != http.StatusOK || len(body.Repos) != 230 {
		t.Fatalf("status = %d, %d repos; want 230", status, len(body.Repos))
	}
	if n := f.called("/user/installations/1/repositories"); n != 3 {
		t.Errorf("repository pages fetched = %d, want 3", n)
	}
}

func TestListReposErrors(t *testing.T) {
	tests := []struct {
		name     string
		token    string
		hasToken bool
		status   int
		want     int
	}{
		{name: "no GitHub token for the user", hasToken: false, want: http.StatusUnauthorized},
		{name: "GitHub rejects the token", token: "revoked", hasToken: true, want: http.StatusUnauthorized},
		{name: "GitHub is down", token: "user-token", hasToken: true, status: http.StatusInternalServerError, want: http.StatusBadGateway},
		{name: "GitHub is rate limiting", token: "user-token", hasToken: true, status: http.StatusForbidden, want: http.StatusBadGateway},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newFakeGitHubAPI(t)
			f.status = tt.status

			status, _ := listRepos(t, f, tt.token, tt.hasToken)

			if status != tt.want {
				t.Fatalf("status = %d, want %d", status, tt.want)
			}
		})
	}
}
