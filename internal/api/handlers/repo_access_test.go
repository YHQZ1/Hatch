package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/YHQZ1/hatch/internal/githubapp"
	"github.com/YHQZ1/hatch/internal/jobs"
	"github.com/YHQZ1/hatch/internal/secrets"
)

const (
	installationToken = "ghs_installation"
	userToken         = "ghu_user"
)

// fakeTokens is the GitHub App's token source.
type fakeTokens struct {
	mu    sync.Mutex
	err   error
	calls []string
}

func (f *fakeTokens) InstallationToken(_ context.Context, owner, name string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, owner+"/"+name)
	if f.err != nil {
		return "", f.err
	}
	return installationToken, nil
}

func (f *fakeTokens) called() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.calls)
}

// fakeGitHub answers the checks Hatch makes about a repository, and records
// every request so a test can see what was asked and with which token.
type fakeGitHub struct {
	server *httptest.Server
	mu     sync.Mutex
	paths  []string
	auths  []string
}

func newFakeGitHub(t *testing.T) *fakeGitHub {
	t.Helper()
	f := &fakeGitHub{}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		f.paths = append(f.paths, r.Method+" "+r.URL.Path)
		f.auths = append(f.auths, r.Header.Get("Authorization"))
		f.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		// What the signed-in user's token can see: their own repository, not another's.
		case "/repos/octo/shop":
			if r.Header.Get("Authorization") != "Bearer "+userToken {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			_, _ = w.Write([]byte(`{"full_name":"octo/shop"}`))
		case "/repos/octo/expired":
			w.WriteHeader(http.StatusUnauthorized)
		case "/repos/octo/shop/branches/main", "/repos/octo/shop/branches/release":
			_, _ = w.Write([]byte(`{"commit":{"sha":"1234567890abcdef","commit":{"message":"Ship it\n\nmore"}}}`))
		case "/repos/octo/shop/contents/Dockerfile", "/repos/octo/shop/contents/api/Dockerfile":
			_, _ = w.Write([]byte(`{"type":"file"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(f.server.Close)
	return f
}

func (f *fakeGitHub) requests() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.paths...)
}

// onlyUsed reports whether every request that was not the user-access check used
// the given token: reading the repository must be done as the App.
func (f *fakeGitHub) onlyUsed(token string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for i, a := range f.auths {
		// A request for the repository itself (three path segments) is the check that
		// the user may use it, made with the user's own token.
		if strings.HasPrefix(f.paths[i], "GET /repos/") && strings.Count(f.paths[i], "/") == 3 {
			continue
		}
		n++
		if a != "Bearer "+token {
			return false
		}
	}
	return n > 0
}

// projectsAPI is the project handler over the fake GitHub and token source.
type projectsAPI struct {
	projectFixture
	handler *ProjectHandler
	tokens  *fakeTokens
	github  *fakeGitHub
}

func newProjectsAPI(t *testing.T, webhooks bool) projectsAPI {
	t.Helper()
	f := newProjectFixture(t, "active")
	inserter, err := jobs.NewInserter(f.pool)
	if err != nil {
		t.Fatal(err)
	}
	codec, err := secrets.NewCodec(strings.Repeat("k", 32))
	if err != nil {
		t.Fatal(err)
	}
	tokens := &fakeTokens{}
	h := NewProjectHandler(f.pool, inserter, codec, tokens, webhooks)
	gh := newFakeGitHub(t)
	h.githubAPI = gh.server.URL
	h.userToken = func(*gin.Context) (string, bool) { return userToken, true }
	return projectsAPI{projectFixture: f, handler: h, tokens: tokens, github: gh}
}

func (a projectsAPI) call(t *testing.T, handler gin.HandlerFunc, params gin.Params, body any) (int, map[string]any) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(raw))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", a.user.ID.String())
	c.Params = params
	handler(c)
	c.Writer.WriteHeaderNow()
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

func newProjectBody(over map[string]any) map[string]any {
	body := map[string]any{
		"repo_name": "Shop 2", "repo_url": "https://github.com/octo/shop", "subdomain": "shop-two",
		"branch": "main", "dockerfile_path": "Dockerfile", "port": 8080, "health_check": "/health",
	}
	for k, v := range over {
		body[k] = v
	}
	return body
}

func TestCreatingAProjectChecksTheRepositoryAsTheAppAndRegistersNoWebhook(t *testing.T) {
	for _, webhooks := range []bool{true, false} {
		t.Run(map[bool]string{true: "with the App's webhook set up", false: "without it"}[webhooks], func(t *testing.T) {
			a := newProjectsAPI(t, webhooks)

			status, body := a.call(t, a.handler.CreateProject, nil, newProjectBody(nil))

			if status != http.StatusCreated {
				t.Fatalf("status %d, body %v", status, body)
			}
			// Whether a push can deploy it depends on the server being able to hear pushes.
			if body["auto_deploy"] != webhooks {
				t.Errorf("auto_deploy = %v, want %v", body["auto_deploy"], webhooks)
			}
			if body["health_check"] != "/health" {
				t.Errorf("health_check = %v", body["health_check"])
			}
			if a.tokens.calls[0] != "octo/shop" {
				t.Errorf("token requested for %v", a.tokens.calls)
			}
			if !a.github.onlyUsed(installationToken) {
				t.Errorf("GitHub was asked with something other than the installation token: %v", a.github.auths)
			}
			for _, path := range a.github.requests() {
				if strings.Contains(path, "/hooks") || !strings.HasPrefix(path, "GET ") {
					t.Errorf("Hatch made the request %q; it must only read, and register no webhook", path)
				}
			}
		})
	}
}

func TestAUserCannotCreateAProjectForARepositoryTheyCannotSee(t *testing.T) {
	// The App is installed on octo/private (the fake's installation token works for
	// every repository), but the signed-in user cannot see it: it is someone else's.
	a := newProjectsAPI(t, true)

	status, body := a.call(t, a.handler.CreateProject, nil, newProjectBody(map[string]any{
		"repo_url": "https://github.com/octo/private", "subdomain": "stolen",
	}))

	msg, _ := body["error"].(string)
	if status != http.StatusBadRequest || !strings.Contains(msg, "could not find octo/private with your GitHub account") {
		t.Fatalf("status %d, error %q", status, msg)
	}
	if a.tokens.called() != 0 {
		t.Error("the App's token was used for a repository the user may not use")
	}
	projects, _ := a.q.GetProjectsByUserID(context.Background(), a.user.ID)
	if len(projects) != 1 {
		t.Errorf("%d projects: one was created for someone else's repository", len(projects))
	}
}

func TestCreatingAProjectNeedsTheUsersGitHubSession(t *testing.T) {
	t.Run("none at all", func(t *testing.T) {
		a := newProjectsAPI(t, true)
		a.handler.userToken = func(*gin.Context) (string, bool) { return "", false }
		if status, _ := a.call(t, a.handler.CreateProject, nil, newProjectBody(nil)); status != http.StatusUnauthorized {
			t.Fatalf("status %d, want 401", status)
		}
		if a.tokens.called() != 0 {
			t.Error("the App's token was used without a signed-in GitHub session")
		}
	})
	t.Run("one GitHub rejects", func(t *testing.T) {
		a := newProjectsAPI(t, true)
		status, body := a.call(t, a.handler.CreateProject, nil, newProjectBody(map[string]any{"repo_url": "https://github.com/octo/expired"}))
		if status != http.StatusUnauthorized || !strings.Contains(body["error"].(string), "Sign in again") {
			t.Fatalf("status %d, body %v", status, body)
		}
	})
}

func TestAProjectIsNotCreatedWhenTheAppCannotReadTheRepository(t *testing.T) {
	tests := []struct {
		name    string
		tokens  error
		body    map[string]any
		want    int
		message string
	}{
		{"the App is not installed there", githubapp.ErrNotInstalled, nil, http.StatusBadRequest, "not installed on octo/shop"},
		{"GitHub cannot be reached", errors.New("dial tcp: timeout"), nil, http.StatusBadGateway, "right now"},
		{"the branch does not exist", nil, map[string]any{"branch": "nope"}, http.StatusBadRequest, `branch "nope" was not found`},
		{"there is no Dockerfile", nil, map[string]any{"dockerfile_path": "missing/Dockerfile"}, http.StatusBadRequest, "no Dockerfile found"},
		{"the address is not a repository", nil, map[string]any{"repo_url": "https://example.com/x/y"}, http.StatusBadRequest, "GitHub repository URL"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a := newProjectsAPI(t, true)
			a.tokens.err = tt.tokens

			status, body := a.call(t, a.handler.CreateProject, nil, newProjectBody(tt.body))

			msg, _ := body["error"].(string)
			if status != tt.want || !strings.Contains(msg, tt.message) {
				t.Fatalf("status %d, error %q; want %d containing %q", status, msg, tt.want, tt.message)
			}
			projects, err := a.q.GetProjectsByUserID(context.Background(), a.user.ID)
			if err != nil || len(projects) != 1 { // only the fixture's own
				t.Errorf("projects = %d (%v): a refused request created one", len(projects), err)
			}
		})
	}
}

func (a projectsAPI) update(t *testing.T, body map[string]any) (int, map[string]any) {
	t.Helper()
	return a.call(t, a.handler.UpdateProject, gin.Params{{Key: "id", Value: a.project.ID.String()}}, body)
}

func TestChangingOnlyTheBuildSettingsNeverAsksGitHub(t *testing.T) {
	a := newProjectsAPI(t, false)
	status, body := a.update(t, map[string]any{"port": 9000, "health_check": "/up", "repo_name": "Renamed"})
	if status != http.StatusOK || body["port"] != float64(9000) || body["health_check"] != "/up" {
		t.Fatalf("status %d, body %v", status, body)
	}
	if a.tokens.called() != 0 || len(a.github.requests()) != 0 {
		t.Errorf("GitHub was asked (%d token, %d requests) for a change that does not involve it", a.tokens.called(), len(a.github.requests()))
	}
}

func TestChangingTheBranchChecksItAsTheApp(t *testing.T) {
	a := newProjectsAPI(t, false)

	if status, body := a.update(t, map[string]any{"branch": "release"}); status != http.StatusOK || body["branch"] != "release" {
		t.Fatalf("status %d, body %v", status, body)
	}
	if !a.github.onlyUsed(installationToken) {
		t.Errorf("auths = %v", a.github.auths)
	}

	if status, body := a.update(t, map[string]any{"branch": "nope"}); status != http.StatusBadRequest || !strings.Contains(body["error"].(string), "nope") {
		t.Fatalf("a missing branch: status %d, body %v", status, body)
	}

	a.tokens.err = githubapp.ErrNotInstalled
	status, body := a.update(t, map[string]any{"branch": "main"})
	if status != http.StatusConflict || !strings.Contains(body["error"].(string), "not installed") {
		t.Fatalf("App not installed: status %d, body %v", status, body)
	}
}

func TestDeployOnPushCanOnlyBeTurnedOnWhereAPushCanBeHeard(t *testing.T) {
	ctx := context.Background()
	set := func(t *testing.T, a projectsAPI, on bool) {
		if _, err := a.pool.Exec(ctx, `UPDATE projects SET auto_deploy = $2 WHERE id = $1`, a.project.ID, on); err != nil {
			t.Fatal(err)
		}
	}
	off := func(t *testing.T, a projectsAPI) { set(t, a, false) }

	t.Run("refused without the webhook", func(t *testing.T) {
		a := newProjectsAPI(t, false)
		off(t, a)
		status, body := a.update(t, map[string]any{"auto_deploy": true})
		if status != http.StatusConflict || !strings.Contains(body["error"].(string), "GITHUB_WEBHOOK_SECRET") {
			t.Fatalf("status %d, body %v", status, body)
		}
		if got, _ := a.q.GetProjectByID(ctx, a.project.ID); got.AutoDeploy {
			t.Error("the setting was changed")
		}
	})
	t.Run("allowed with it, and needs no call to GitHub", func(t *testing.T) {
		a := newProjectsAPI(t, true)
		off(t, a)
		status, body := a.update(t, map[string]any{"auto_deploy": true})
		if status != http.StatusOK || body["auto_deploy"] != true {
			t.Fatalf("status %d, body %v", status, body)
		}
		if a.tokens.called() != 0 || len(a.github.requests()) != 0 {
			t.Error("turning the setting on registered or checked something at GitHub")
		}
	})
	t.Run("turning it off is always allowed", func(t *testing.T) {
		a := newProjectsAPI(t, false)
		set(t, a, true) // on, in a server that cannot hear pushes
		status, body := a.update(t, map[string]any{"auto_deploy": false})
		if status != http.StatusOK || body["auto_deploy"] != false {
			t.Fatalf("status %d, body %v", status, body)
		}
	})
	t.Run("a setting from before is left alone by other changes", func(t *testing.T) {
		a := newProjectsAPI(t, false)
		set(t, a, true) // on, in a server that cannot hear pushes
		status, body := a.update(t, map[string]any{"port": 9001})
		if status != http.StatusOK || body["auto_deploy"] != true {
			t.Fatalf("status %d, body %v", status, body)
		}
	})
}

// deploymentsAPI is the deployment handler over the fake GitHub and token source.
type deploymentsAPI struct {
	rollbackFixture
	tokens *fakeTokens
	github *fakeGitHub
}

func newDeploymentsAPI(t *testing.T) deploymentsAPI {
	t.Helper()
	f := newRollbackFixture(t)
	tokens := &fakeTokens{}
	f.handler.tokens = tokens
	gh := newFakeGitHub(t)
	f.handler.githubAPI = gh.server.URL
	return deploymentsAPI{rollbackFixture: f, tokens: tokens, github: gh}
}

func (a deploymentsAPI) deploy(t *testing.T) (int, map[string]any) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"project_id":"`+a.project.ID.String()+`"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", a.user.ID.String())
	a.handler.CreateDeployment(c)
	c.Writer.WriteHeaderNow()
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

func TestDeployingReadsTheLatestCommitAsTheAppAndNeedsNoSignedInGitHubToken(t *testing.T) {
	a := newDeploymentsAPI(t)

	status, body := a.deploy(t)

	if status != http.StatusCreated {
		t.Fatalf("status %d, body %v", status, body)
	}
	if body["commit_sha"] != "1234567890abcdef" || body["commit_message"] != "Ship it" {
		t.Errorf("commit = %v / %v, want the branch's latest", body["commit_sha"], body["commit_message"])
	}
	if !a.github.onlyUsed(installationToken) {
		t.Errorf("GitHub was asked with something other than the installation token: %v", a.github.auths)
	}
	if kinds := a.jobKinds(t); len(kinds) != 1 || kinds[0] != "build" {
		t.Errorf("jobs = %v", kinds)
	}
}

func TestDeployingSaysSoWhenTheAppIsNotInstalled(t *testing.T) {
	a := newDeploymentsAPI(t)
	a.tokens.err = githubapp.ErrNotInstalled

	status, body := a.deploy(t)

	msg, _ := body["error"].(string)
	if status != http.StatusConflict || !strings.Contains(msg, "not installed on octo/shop") {
		t.Fatalf("status %d, error %q", status, msg)
	}
	if kinds := a.jobKinds(t); len(kinds) != 0 {
		t.Errorf("a build was queued that could only fail: %v", kinds)
	}
	rows, _ := a.q.GetDeploymentsByProjectID(context.Background(), a.project.ID)
	if len(rows) != 0 {
		t.Errorf("%d deployment(s) were created", len(rows))
	}
}
