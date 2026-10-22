package auth

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/gin-gonic/gin"
)

// signedInUser signs a user in through the fake GitHub and returns their row.
func (h *harness) signedInUser(t *testing.T) dbpkg.User {
	t.Helper()
	state, stateCookie := h.start(t)
	rec := h.callback(url.Values{"code": {testCode}, "state": {state}}, stateCookie)
	session := cookieNamed(rec, SessionCookieName)
	if session == nil {
		t.Fatal("sign-in failed")
	}
	user, err := h.sessions.Lookup(context.Background(), session.Value)
	if err != nil {
		t.Fatal(err)
	}
	return user
}

// setAccessExpiry moves the stored access token's expiry, so a test can make it
// expired or fresh without waiting. A zero time stores NULL.
func (h *harness) setAccessExpiry(t *testing.T, user dbpkg.User, at time.Time) dbpkg.User {
	t.Helper()
	expiry := sql.NullTime{Time: at, Valid: !at.IsZero()}
	if _, err := h.db.Exec(`UPDATE users SET access_token_expires_at = $2 WHERE id = $1`, user.ID, expiry); err != nil {
		t.Fatal(err)
	}
	reloaded, err := dbpkg.New(h.db).GetUserByID(context.Background(), user.ID)
	if err != nil {
		t.Fatal(err)
	}
	return reloaded
}

func TestAccessTokenIsUsedAsIsWhileItIsFresh(t *testing.T) {
	h := newHarness(t)
	user := h.signedInUser(t)

	got, err := h.tokens.AccessToken(context.Background(), user)

	if err != nil || got != testToken {
		t.Fatalf("AccessToken = %q, %v; want %q", got, err, testToken)
	}
	if n := h.github.refreshed(); n != 0 {
		t.Fatalf("GitHub was asked to renew %d times for a fresh token", n)
	}
}

func TestAccessTokenWithoutExpiryIsNeverRenewed(t *testing.T) {
	// Tokens from before expiry was tracked have no expiry and no refresh token.
	h := newHarness(t)
	user := h.signedInUser(t)
	user = h.setAccessExpiry(t, user, time.Time{})

	got, err := h.tokens.AccessToken(context.Background(), user)

	if err != nil || got != testToken {
		t.Fatalf("AccessToken = %q, %v; want %q", got, err, testToken)
	}
	if n := h.github.refreshed(); n != 0 {
		t.Fatalf("renewed %d times", n)
	}
}

func TestAccessTokenIsRenewedWhenItHasExpired(t *testing.T) {
	h := newHarness(t)
	user := h.signedInUser(t)
	user = h.setAccessExpiry(t, user, time.Now().Add(-time.Minute))

	got, err := h.tokens.AccessToken(context.Background(), user)

	if err != nil {
		t.Fatal(err)
	}
	if want := h.github.latestAccessToken(); got != want || got == testToken {
		t.Fatalf("AccessToken = %q, want the renewed %q", got, want)
	}

	// The renewed pair is stored, encrypted, with new expiries.
	stored, err := dbpkg.New(h.db).GetUserByID(context.Background(), user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if plain, err := h.codec.Decrypt(stored.AccessToken); err != nil || plain != got {
		t.Errorf("stored access token = %q, %v; want %q", plain, err, got)
	}
	if plain, err := h.codec.Decrypt(stored.RefreshToken.String); err != nil || plain == testRefreshToken {
		t.Errorf("stored refresh token = %q, %v; want the rotated one", plain, err)
	}
	if time.Until(stored.AccessTokenExpiresAt.Time) < 7*time.Hour {
		t.Errorf("new expiry %v is not about 8 hours away", stored.AccessTokenExpiresAt.Time)
	}

	// Asking again uses the stored token and does not renew a second time.
	again, err := h.tokens.AccessToken(context.Background(), stored)
	if err != nil || again != got {
		t.Fatalf("second AccessToken = %q, %v; want %q", again, err, got)
	}
	if n := h.github.refreshed(); n != 1 {
		t.Fatalf("renewed %d times, want 1", n)
	}
}

func TestAccessTokenIsRenewedShortlyBeforeItExpires(t *testing.T) {
	h := newHarness(t)
	user := h.signedInUser(t)
	user = h.setAccessExpiry(t, user, time.Now().Add(refreshMargin/2))

	if _, err := h.tokens.AccessToken(context.Background(), user); err != nil {
		t.Fatal(err)
	}
	if n := h.github.refreshed(); n != 1 {
		t.Fatalf("renewed %d times, want 1: a token about to die must not be handed out", n)
	}
}

func TestConcurrentRequestsSpendTheRefreshTokenOnce(t *testing.T) {
	// A refresh token works once. Without the row lock, the second request
	// would present the spent token and the user would be signed out.
	h := newHarness(t)
	user := h.signedInUser(t)
	user = h.setAccessExpiry(t, user, time.Now().Add(-time.Minute))
	h.github.mu.Lock()
	h.github.refreshDelay = 150 * time.Millisecond
	h.github.mu.Unlock()

	const requests = 8
	results := make([]string, requests)
	errs := make([]error, requests)
	var wg sync.WaitGroup
	for i := range requests {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i], errs[i] = h.tokens.AccessToken(context.Background(), user)
		}()
	}
	wg.Wait()

	for i := range requests {
		if errs[i] != nil {
			t.Fatalf("request %d: %v", i, errs[i])
		}
		if results[i] != results[0] {
			t.Fatalf("request %d got %q, request 0 got %q", i, results[i], results[0])
		}
	}
	if n := h.github.refreshed(); n != 1 {
		t.Fatalf("GitHub renewed %d times, want 1", n)
	}
}

func TestAccessTokenNeedsASignInWhenItCannotBeRenewed(t *testing.T) {
	expired := time.Now().Add(-time.Minute)
	tests := []struct {
		name  string
		setup func(t *testing.T, h *harness, user dbpkg.User)
	}{
		{
			name: "no refresh token",
			setup: func(t *testing.T, h *harness, user dbpkg.User) {
				if _, err := h.db.Exec(`UPDATE users SET refresh_token = NULL WHERE id = $1`, user.ID); err != nil {
					t.Fatal(err)
				}
			},
		},
		{
			name: "refresh token has expired",
			setup: func(t *testing.T, h *harness, user dbpkg.User) {
				if _, err := h.db.Exec(`UPDATE users SET refresh_token_expires_at = $2 WHERE id = $1`, user.ID, expired); err != nil {
					t.Fatal(err)
				}
			},
		},
		{
			name: "GitHub rejects the refresh token",
			setup: func(t *testing.T, h *harness, user dbpkg.User) {
				h.github.mu.Lock()
				h.github.refreshToken = "something-else"
				h.github.mu.Unlock()
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t)
			user := h.signedInUser(t)
			tt.setup(t, h, user)
			user = h.setAccessExpiry(t, user, expired)

			_, err := h.tokens.AccessToken(context.Background(), user)

			if !errors.Is(err, ErrReauthRequired) {
				t.Fatalf("err = %v, want ErrReauthRequired", err)
			}
		})
	}
}

// sessionCookie starts a session for the user and returns the cookie a browser
// would send.
func (h *harness) sessionCookie(t *testing.T, user dbpkg.User) *http.Cookie {
	t.Helper()
	token, _, err := h.sessions.Create(context.Background(), user.ID)
	if err != nil {
		t.Fatal(err)
	}
	return &http.Cookie{Name: SessionCookieName, Value: token}
}

func TestHandlersGetTheRenewedTokenThroughTheMiddleware(t *testing.T) {
	h := newHarness(t)
	user := h.signedInUser(t)
	h.setAccessExpiry(t, user, time.Now().Add(-time.Minute))

	rec := h.do(httptest.NewRequest("GET", "/api/me", nil), h.sessionCookie(t, user))

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	if want := h.github.latestAccessToken(); !strings.Contains(rec.Body.String(), want) {
		t.Fatalf("body %s does not carry the renewed token %s", rec.Body, want)
	}
}

func TestRequestsThatDoNotNeedGitHubSucceedWhenRenewalFails(t *testing.T) {
	// The token is fetched on demand, so a dead refresh token does not lock the
	// user out of pages that never call GitHub; only GitHubToken fails.
	h := newHarness(t)
	user := h.signedInUser(t)
	h.setAccessExpiry(t, user, time.Now().Add(-time.Minute))
	h.github.mu.Lock()
	h.github.refreshToken = "something-else"
	h.github.mu.Unlock()
	router := gin.New()
	router.GET("/plain", Middleware(h.sessions, h.tokens), func(c *gin.Context) { c.Status(http.StatusNoContent) })
	router.GET("/needs-github", Middleware(h.sessions, h.tokens), func(c *gin.Context) {
		if _, err := GitHubToken(c); errors.Is(err, ErrReauthRequired) {
			c.Status(http.StatusUnauthorized)
			return
		}
		c.Status(http.StatusOK)
	})
	cookie := h.sessionCookie(t, user)

	for path, want := range map[string]int{"/plain": http.StatusNoContent, "/needs-github": http.StatusUnauthorized} {
		req := httptest.NewRequest("GET", path, nil)
		req.AddCookie(cookie)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Errorf("%s = %d, want %d", path, rec.Code, want)
		}
	}
	if n := h.github.refreshed(); n != 1 {
		t.Errorf("renewal attempted %d times, want 1 (only the request that needed a token)", n)
	}
}
