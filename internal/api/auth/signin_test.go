package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/YHQZ1/hatch/internal/secrets"
	"github.com/gin-gonic/gin"
)

const (
	testFrontend     = "http://localhost:3000"
	testClientID     = "Iv23liTESTCLIENT"
	testClientSecret = "test-client-secret"
	testCode         = "code-from-github"
	testToken        = "ghu_usertoken"
	testRefreshToken = "ghr_refreshtoken"
)

// fakeGitHub stands in for github.com and api.github.com.
type fakeGitHub struct {
	server *httptest.Server
	// What the fake answers; tests change these to simulate failures.
	exchangeError string
	userStatus    int
	user          GitHubUser

	// Refresh tokens are single-use, as on GitHub: a refresh returns a new one
	// and the old one stops working. mu guards what follows.
	mu sync.Mutex
	// refreshDelay makes renewal slow, so concurrent requests overlap.
	refreshDelay  time.Duration
	refreshToken  string
	refreshCalls  int
	refreshIssued int
}

// refreshed returns how many times the token endpoint was asked to renew.
func (f *fakeGitHub) refreshed() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.refreshCalls
}

// latestAccessToken is the access token the most recent refresh handed out.
func (f *fakeGitHub) latestAccessToken() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return fmt.Sprintf("ghu_renewed%d", f.refreshIssued)
}

func newFakeGitHub(t *testing.T) *fakeGitHub {
	t.Helper()
	f := &fakeGitHub{
		userStatus:   http.StatusOK,
		user:         GitHubUser{ID: 4242, Login: "octocat"},
		refreshToken: testRefreshToken,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		w.Header().Set("Content-Type", "application/json")
		if r.Form.Get("grant_type") == "refresh_token" {
			f.mu.Lock()
			delay := f.refreshDelay
			f.mu.Unlock()
			time.Sleep(delay)

			f.mu.Lock()
			defer f.mu.Unlock()
			f.refreshCalls++
			if r.Form.Get("client_id") != testClientID ||
				r.Form.Get("client_secret") != testClientSecret ||
				r.Form.Get("refresh_token") != f.refreshToken {
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "bad_refresh_token"})
				return
			}
			f.refreshIssued++
			f.refreshToken = fmt.Sprintf("ghr_renewed%d", f.refreshIssued)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token":             fmt.Sprintf("ghu_renewed%d", f.refreshIssued),
				"refresh_token":            f.refreshToken,
				"expires_in":               28800,
				"refresh_token_expires_in": 15811200,
			})
			return
		}
		switch {
		case f.exchangeError != "":
			_ = json.NewEncoder(w).Encode(map[string]string{"error": f.exchangeError})
		case r.Form.Get("client_id") != testClientID ||
			r.Form.Get("client_secret") != testClientSecret ||
			r.Form.Get("code") != testCode:
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "bad_verification_code"})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token":             testToken,
				"refresh_token":            testRefreshToken,
				"expires_in":               28800,
				"refresh_token_expires_in": 15811200,
			})
		}
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+testToken {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(f.userStatus)
		if f.userStatus == http.StatusOK {
			_ = json.NewEncoder(w).Encode(f.user)
		}
	})
	f.server = httptest.NewServer(mux)
	t.Cleanup(f.server.Close)
	return f
}

type harness struct {
	router   *gin.Engine
	github   *fakeGitHub
	tokens   *Tokens
	sessions *Sessions
	db       *sql.DB
	codec    *secrets.Codec
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	gin.SetMode(gin.TestMode)
	sessions, db, _ := newTestSessions(t)
	codec, err := secrets.NewCodec(strings.Repeat("k", 32))
	if err != nil {
		t.Fatal(err)
	}
	github := newFakeGitHub(t)

	handler := NewHandler(Config{
		ClientID:     testClientID,
		ClientSecret: testClientSecret,
		RedirectURI:  "http://localhost:8080/auth/callback",
		FrontendURL:  testFrontend + "/",
		AppSlug:      "hatch-local-dev",
	}, db, sessions, codec)
	handler.githubURL = github.server.URL
	handler.apiURL = github.server.URL

	tokens := NewTokens(db, codec, testClientID, testClientSecret)
	tokens.githubURL = github.server.URL
	authenticated := Middleware(sessions, tokens)
	router := gin.New()
	router.GET("/auth/github", handler.RedirectToGitHub)
	router.GET("/auth/install", handler.RedirectToInstall)
	router.GET("/auth/callback", handler.HandleCallback)
	router.POST("/auth/logout", authenticated, CSRFMiddleware(), handler.Logout)
	router.GET("/api/me", authenticated, func(c *gin.Context) {
		token, err := GitHubToken(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"username": c.MustGet("username"), "access_token": token})
	})
	return &harness{router: router, github: github, tokens: tokens, sessions: sessions, db: db, codec: codec}
}

func (h *harness) do(req *http.Request, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)
	return rec
}

func cookieNamed(rec *httptest.ResponseRecorder, name string) *http.Cookie {
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == name {
			return cookie
		}
	}
	return nil
}

// start begins a sign-in the way a browser would and returns the state GitHub
// would send back along with the state cookie.
func (h *harness) start(t *testing.T) (state string, cookie *http.Cookie) {
	t.Helper()
	rec := h.do(httptest.NewRequest("GET", "/auth/github", nil))
	location, err := url.Parse(rec.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	cookie = cookieNamed(rec, OAuthStateCookieName)
	if cookie == nil {
		t.Fatal("no state cookie set")
	}
	return location.Query().Get("state"), cookie
}

func (h *harness) callback(query url.Values, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	return h.do(httptest.NewRequest("GET", "/auth/callback?"+query.Encode(), nil), cookies...)
}

func (h *harness) countRows(t *testing.T, table string) int {
	t.Helper()
	var n int
	if err := h.db.QueryRow(`SELECT count(*) FROM ` + table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestLoginRedirectsToGitHubWithState(t *testing.T) {
	h := newHarness(t)

	rec := h.do(httptest.NewRequest("GET", "/auth/github", nil))

	if rec.Code != http.StatusTemporaryRedirect {
		t.Fatalf("status = %d, want 307", rec.Code)
	}
	location, err := url.Parse(rec.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	if got := location.Scheme + "://" + location.Host + location.Path; got != h.github.server.URL+"/login/oauth/authorize" {
		t.Fatalf("redirects to %s", got)
	}
	query := location.Query()
	if query.Get("client_id") != testClientID {
		t.Errorf("client_id = %q", query.Get("client_id"))
	}
	if query.Get("redirect_uri") != "http://localhost:8080/auth/callback" {
		t.Errorf("redirect_uri = %q", query.Get("redirect_uri"))
	}
	if query.Has("scope") {
		t.Errorf("a GitHub App takes its permissions from its settings, but scope = %q", query.Get("scope"))
	}
	state := query.Get("state")
	if len(state) < 32 {
		t.Fatalf("state %q is too short", state)
	}
	cookie := cookieNamed(rec, OAuthStateCookieName)
	if cookie == nil || cookie.Value != state || !cookie.HttpOnly || cookie.Path != "/auth/callback" {
		t.Fatalf("state cookie = %+v, want HttpOnly with the same state on /auth/callback", cookie)
	}
}

func TestLoginStatesDiffer(t *testing.T) {
	h := newHarness(t)
	a, _ := h.start(t)
	b, _ := h.start(t)
	if a == b {
		t.Fatal("two sign-ins share a state")
	}
}

func TestInstallRedirectsToTheAppInstallPageWithState(t *testing.T) {
	h := newHarness(t)

	rec := h.do(httptest.NewRequest("GET", "/auth/install", nil))

	location, err := url.Parse(rec.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	if location.Path != "/apps/hatch-local-dev/installations/new" {
		t.Fatalf("path = %q", location.Path)
	}
	cookie := cookieNamed(rec, OAuthStateCookieName)
	if cookie == nil || cookie.Value != location.Query().Get("state") {
		t.Fatalf("state cookie %+v does not match the state sent to GitHub", cookie)
	}
}

func TestCallbackSignsTheUserIn(t *testing.T) {
	h := newHarness(t)
	state, stateCookie := h.start(t)

	rec := h.callback(url.Values{"code": {testCode}, "state": {state}}, stateCookie)

	if rec.Code != http.StatusTemporaryRedirect || rec.Header().Get("Location") != testFrontend+"/auth/success" {
		t.Fatalf("got %d to %q, want a redirect to the success page", rec.Code, rec.Header().Get("Location"))
	}

	session := cookieNamed(rec, SessionCookieName)
	if session == nil || session.Value == "" {
		t.Fatal("no session cookie set")
	}
	if !session.HttpOnly || session.SameSite != http.SameSiteLaxMode || session.Path != "/" {
		t.Errorf("session cookie = %+v, want HttpOnly, SameSite=Lax, path /", session)
	}
	if session.Secure {
		t.Error("cookie is Secure over plain http, which a browser would not send back in development")
	}
	if cookieNamed(rec, CSRFCookieName) == nil {
		t.Error("no CSRF cookie set")
	}
	if used := cookieNamed(rec, OAuthStateCookieName); used == nil || used.MaxAge >= 0 {
		t.Error("the state cookie should be cleared once used")
	}

	user, err := h.sessions.Lookup(context.Background(), session.Value)
	if err != nil {
		t.Fatalf("session from the callback is not valid: %v", err)
	}
	if user.GithubID != 4242 || user.GithubUsername != "octocat" {
		t.Fatalf("user = %+v", user)
	}
	if user.AccessToken == testToken {
		t.Error("the GitHub token was stored unencrypted")
	}
	if got, err := h.codec.Decrypt(user.AccessToken); err != nil || got != testToken {
		t.Errorf("stored token decrypts to %q, %v", got, err)
	}
	if !user.RefreshToken.Valid || user.RefreshToken.String == testRefreshToken {
		t.Error("the refresh token was not stored, or was stored unencrypted")
	} else if got, err := h.codec.Decrypt(user.RefreshToken.String); err != nil || got != testRefreshToken {
		t.Errorf("stored refresh token decrypts to %q, %v", got, err)
	}
	if !user.AccessTokenExpiresAt.Valid || time.Until(user.AccessTokenExpiresAt.Time) < 7*time.Hour {
		t.Errorf("access token expiry = %+v, want about 8 hours away", user.AccessTokenExpiresAt)
	}
	if !user.RefreshTokenExpiresAt.Valid || time.Until(user.RefreshTokenExpiresAt.Time) < 24*time.Hour*170 {
		t.Errorf("refresh token expiry = %+v, want about six months away", user.RefreshTokenExpiresAt)
	}
}

func TestCallbackIsSecureBehindATLSProxy(t *testing.T) {
	h := newHarness(t)
	state, stateCookie := h.start(t)
	req := httptest.NewRequest("GET", "/auth/callback?"+url.Values{"code": {testCode}, "state": {state}}.Encode(), nil)
	req.Header.Set("X-Forwarded-Proto", "https")

	rec := h.do(req, stateCookie)

	if session := cookieNamed(rec, SessionCookieName); session == nil || !session.Secure {
		t.Fatalf("session cookie = %+v, want Secure behind https", session)
	}
}

func TestSigningInAgainReusesTheUser(t *testing.T) {
	h := newHarness(t)
	signIn := func() *http.Cookie {
		state, stateCookie := h.start(t)
		rec := h.callback(url.Values{"code": {testCode}, "state": {state}}, stateCookie)
		return cookieNamed(rec, SessionCookieName)
	}

	first := signIn()
	h.github.user.Login = "octocat-renamed"
	second := signIn()

	if first.Value == second.Value {
		t.Fatal("a new sign-in reused the old session")
	}
	if n := h.countRows(t, "users"); n != 1 {
		t.Fatalf("%d users, want 1", n)
	}
	user, err := h.sessions.Lookup(context.Background(), second.Value)
	if err != nil || user.GithubUsername != "octocat-renamed" {
		t.Fatalf("user = %+v, %v; want the username refreshed", user, err)
	}
	if n := h.countRows(t, "sessions"); n != 2 {
		t.Fatalf("%d sessions, want one per sign-in", n)
	}
}

func TestCallbackFailuresSendTheBrowserBackWithoutASession(t *testing.T) {
	tests := []struct {
		name  string
		setup func(h *harness)
		query func(state string) url.Values
		// noStateCookie sends the callback without the cookie from sign-in.
		noStateCookie bool
		wantError     string
	}{
		{
			name:      "state does not match",
			query:     func(string) url.Values { return url.Values{"code": {testCode}, "state": {"forged"}} },
			wantError: "state",
		},
		{
			name:          "no state cookie",
			noStateCookie: true,
			query:         func(s string) url.Values { return url.Values{"code": {testCode}, "state": {s}} },
			wantError:     "state",
		},
		{
			name:      "no state at all",
			query:     func(string) url.Values { return url.Values{"code": {testCode}} },
			wantError: "state",
		},
		{
			name:      "user declined on GitHub",
			query:     func(s string) url.Values { return url.Values{"error": {"access_denied"}, "state": {s}} },
			wantError: "denied",
		},
		{
			name:      "no code",
			query:     func(s string) url.Values { return url.Values{"state": {s}} },
			wantError: "denied",
		},
		{
			name:      "code rejected by GitHub",
			query:     func(s string) url.Values { return url.Values{"code": {"wrong"}, "state": {s}} },
			wantError: "exchange",
		},
		{
			name:      "GitHub reports an exchange error",
			setup:     func(h *harness) { h.github.exchangeError = "bad_verification_code" },
			query:     func(s string) url.Values { return url.Values{"code": {testCode}, "state": {s}} },
			wantError: "exchange",
		},
		{
			name:      "profile lookup fails",
			setup:     func(h *harness) { h.github.userStatus = http.StatusBadGateway },
			query:     func(s string) url.Values { return url.Values{"code": {testCode}, "state": {s}} },
			wantError: "github",
		},
		{
			name:      "profile is invalid",
			setup:     func(h *harness) { h.github.user = GitHubUser{} },
			query:     func(s string) url.Values { return url.Values{"code": {testCode}, "state": {s}} },
			wantError: "github",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t)
			if tt.setup != nil {
				tt.setup(h)
			}
			state, stateCookie := h.start(t)
			cookies := []*http.Cookie{stateCookie}
			if tt.noStateCookie {
				cookies = nil
			}

			rec := h.callback(tt.query(state), cookies...)

			want := testFrontend + "/auth?error=" + tt.wantError
			if rec.Code != http.StatusTemporaryRedirect || rec.Header().Get("Location") != want {
				t.Fatalf("got %d to %q, want a redirect to %q", rec.Code, rec.Header().Get("Location"), want)
			}
			if cookieNamed(rec, SessionCookieName) != nil {
				t.Error("a session cookie was set on a failed sign-in")
			}
			if n := h.countRows(t, "sessions"); n != 0 {
				t.Errorf("%d sessions created on a failed sign-in", n)
			}
			if n := h.countRows(t, "users"); n != 0 {
				t.Errorf("%d users created on a failed sign-in", n)
			}
		})
	}
}

func TestAStateCannotBeReplayedAfterUse(t *testing.T) {
	h := newHarness(t)
	state, stateCookie := h.start(t)
	query := url.Values{"code": {testCode}, "state": {state}}

	if rec := h.callback(query, stateCookie); cookieNamed(rec, SessionCookieName) == nil {
		t.Fatal("first callback should sign in")
	}
	// A browser drops the cleared cookie, so the replay arrives without it.
	rec := h.callback(query)
	if cookieNamed(rec, SessionCookieName) != nil {
		t.Fatal("replayed callback signed in")
	}
}

func TestMiddlewareRequiresAValidSession(t *testing.T) {
	h := newHarness(t)
	state, stateCookie := h.start(t)
	rec := h.callback(url.Values{"code": {testCode}, "state": {state}}, stateCookie)
	session := cookieNamed(rec, SessionCookieName)

	t.Run("valid session", func(t *testing.T) {
		rec := h.do(httptest.NewRequest("GET", "/api/me", nil), session)
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"username":"octocat"`) {
			t.Fatalf("got %d %s", rec.Code, rec.Body)
		}
		if !strings.Contains(rec.Body.String(), testToken) {
			t.Error("handlers need the decrypted GitHub token in the context")
		}
	})

	for name, cookie := range map[string]*http.Cookie{
		"no cookie":      nil,
		"unknown cookie": {Name: SessionCookieName, Value: "unknown"},
		"old JWT cookie": {Name: SessionCookieName, Value: "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoieCJ9.sig"},
	} {
		t.Run(name, func(t *testing.T) {
			var cookies []*http.Cookie
			if cookie != nil {
				cookies = append(cookies, cookie)
			}
			rec := h.do(httptest.NewRequest("GET", "/api/me", nil), cookies...)
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want 401", rec.Code)
			}
		})
	}

	t.Run("a bearer token is not accepted", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/me", nil)
		req.Header.Set("Authorization", "Bearer "+session.Value)
		if rec := h.do(req); rec.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", rec.Code)
		}
	})
}

func TestLogoutEndsTheSession(t *testing.T) {
	h := newHarness(t)
	state, stateCookie := h.start(t)
	signedIn := h.callback(url.Values{"code": {testCode}, "state": {state}}, stateCookie)
	session, csrf := cookieNamed(signedIn, SessionCookieName), cookieNamed(signedIn, CSRFCookieName)

	t.Run("needs the CSRF token", func(t *testing.T) {
		rec := h.do(httptest.NewRequest("POST", "/auth/logout", nil), session, csrf)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want 403", rec.Code)
		}
		if _, err := h.sessions.Lookup(context.Background(), session.Value); err != nil {
			t.Fatalf("a forged logout ended the session: %v", err)
		}
	})

	req := httptest.NewRequest("POST", "/auth/logout", nil)
	req.Header.Set(CSRFHeaderName, csrf.Value)
	rec := h.do(req, session, csrf)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if cleared := cookieNamed(rec, SessionCookieName); cleared == nil || cleared.MaxAge >= 0 {
		t.Errorf("session cookie not cleared: %+v", cleared)
	}
	if n := h.countRows(t, "sessions"); n != 0 {
		t.Fatalf("%d sessions left in the database after logout", n)
	}
	// The old cookie is dead even if someone kept a copy.
	if rec := h.do(httptest.NewRequest("GET", "/api/me", nil), session); rec.Code != http.StatusUnauthorized {
		t.Fatalf("session still works after logout: %d", rec.Code)
	}
}

func TestSessionsAreNotSharedBetweenUsers(t *testing.T) {
	h := newHarness(t)
	signIn := func(id int64, login string) *http.Cookie {
		h.github.user = GitHubUser{ID: id, Login: login}
		state, stateCookie := h.start(t)
		return cookieNamed(h.callback(url.Values{"code": {testCode}, "state": {state}}, stateCookie), SessionCookieName)
	}
	alice, bob := signIn(1, "alice"), signIn(2, "bob")

	for cookie, want := range map[*http.Cookie]string{alice: "alice", bob: "bob"} {
		rec := h.do(httptest.NewRequest("GET", "/api/me", nil), cookie)
		if !strings.Contains(rec.Body.String(), `"username":"`+want+`"`) {
			t.Errorf("session for %s answered %s", want, rec.Body)
		}
	}
}
