package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/YHQZ1/hatch/internal/secrets"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/gin-gonic/gin"
)

type GitHubUser struct {
	ID    int64  `json:"id"`
	Login string `json:"login"`
}

// Config holds the GitHub App settings sign-in needs.
type Config struct {
	ClientID     string
	ClientSecret string
	// RedirectURI is the App's callback URL, which points at /auth/callback.
	RedirectURI string
	// FrontendURL is where the browser is sent after sign-in.
	FrontendURL string
	// AppSlug is the App's URL name, used for the installation link.
	AppSlug string
}

type Handler struct {
	cfg      Config
	queries  *dbpkg.Queries
	sessions *Sessions
	secrets  *secrets.Codec

	// githubURL and apiURL are GitHub's web and API origins; tests point them
	// at a fake.
	githubURL string
	apiURL    string
}

const SessionCookieName = "hatch_session"
const OAuthStateCookieName = "hatch_oauth_state"

var githubHTTPClient = &http.Client{Timeout: 12 * time.Second}

func NewHandler(cfg Config, db *sql.DB, sessions *Sessions, secretCodec *secrets.Codec) *Handler {
	cfg.FrontendURL = strings.TrimRight(cfg.FrontendURL, "/")
	return &Handler{
		cfg:       cfg,
		queries:   dbpkg.New(db),
		sessions:  sessions,
		secrets:   secretCodec,
		githubURL: "https://github.com",
		apiURL:    "https://api.github.com",
	}
}

// RedirectToGitHub starts sign-in: it sends the browser to GitHub to authorize
// the Hatch App. A GitHub App takes its permissions from its settings, so no
// scope is requested.
func (h *Handler) RedirectToGitHub(c *gin.Context) {
	state, ok := h.beginFlow(c)
	if !ok {
		return
	}

	params := url.Values{}
	params.Set("client_id", h.cfg.ClientID)
	params.Set("redirect_uri", h.cfg.RedirectURI)
	params.Set("state", state)

	c.Redirect(http.StatusTemporaryRedirect, h.githubURL+"/login/oauth/authorize?"+params.Encode())
}

// RedirectToInstall sends the browser to GitHub to install the App on the
// user's repositories. Because the App asks for user authorization during
// installation, GitHub finishes at /auth/callback, so installing also signs in.
func (h *Handler) RedirectToInstall(c *gin.Context) {
	state, ok := h.beginFlow(c)
	if !ok {
		return
	}

	params := url.Values{}
	params.Set("state", state)
	c.Redirect(http.StatusTemporaryRedirect,
		h.githubURL+"/apps/"+url.PathEscape(h.cfg.AppSlug)+"/installations/new?"+params.Encode())
}

func (h *Handler) beginFlow(c *gin.Context) (string, bool) {
	state, err := generateOAuthState()
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "failed to generate oauth state", "error", err)
		h.redirectError(c, "server")
		return "", false
	}
	setOAuthStateCookie(c, state)
	return state, true
}

// HandleCallback finishes sign-in. Whatever goes wrong, the browser is sent
// back to the sign-in page with an error code, never shown a raw response.
func (h *Handler) HandleCallback(c *gin.Context) {
	ctx := c.Request.Context()

	stateOK := validOAuthState(c)
	clearOAuthStateCookie(c)
	if !stateOK {
		h.redirectError(c, "state")
		return
	}

	if c.Query("error") != "" {
		// The user declined, or GitHub refused the request.
		h.redirectError(c, "denied")
		return
	}
	code := c.Query("code")
	if code == "" {
		h.redirectError(c, "denied")
		return
	}

	token, err := h.exchangeCodeForToken(ctx, code)
	if err != nil {
		slog.WarnContext(ctx, "github code exchange failed", "error", err)
		h.redirectError(c, "exchange")
		return
	}

	ghUser, err := h.fetchGitHubUser(ctx, token)
	if err != nil {
		slog.WarnContext(ctx, "github profile fetch failed", "error", err)
		h.redirectError(c, "github")
		return
	}

	storedToken, err := h.secrets.Encrypt(token)
	if err != nil {
		slog.ErrorContext(ctx, "failed to encrypt github token", "error", err)
		h.redirectError(c, "server")
		return
	}

	dbUser, err := h.queries.CreateUser(ctx, dbpkg.CreateUserParams{
		GithubID:       ghUser.ID,
		GithubUsername: ghUser.Login,
		AccessToken:    storedToken,
	})
	if err != nil {
		slog.ErrorContext(ctx, "failed to save user", "github_id", ghUser.ID, "error", err)
		h.redirectError(c, "server")
		return
	}

	sessionToken, expires, err := h.sessions.Create(ctx, dbUser.ID)
	if err != nil {
		slog.ErrorContext(ctx, "failed to create session", "user_id", dbUser.ID, "error", err)
		h.redirectError(c, "server")
		return
	}
	if _, err := EnsureCSRFCookieWithError(c); err != nil {
		slog.ErrorContext(ctx, "failed to create csrf token", "error", err)
		h.redirectError(c, "server")
		return
	}
	setSessionCookie(c, sessionToken, expires)

	// Housekeeping: ended sessions are removed whenever someone signs in.
	if _, err := h.sessions.DeleteExpired(ctx); err != nil {
		slog.WarnContext(ctx, "failed to remove expired sessions", "error", err)
	}

	c.Redirect(http.StatusTemporaryRedirect, h.cfg.FrontendURL+"/auth/success")
}

// Logout ends the current session.
func (h *Handler) Logout(c *gin.Context) {
	if token, err := c.Cookie(SessionCookieName); err == nil {
		if err := h.sessions.Delete(c.Request.Context(), token); err != nil {
			slog.ErrorContext(c.Request.Context(), "failed to delete session", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to sign out"})
			return
		}
	}
	clearSessionCookie(c)
	ClearCSRFCookie(c)
	c.Status(http.StatusNoContent)
}

func (h *Handler) redirectError(c *gin.Context, code string) {
	c.Redirect(http.StatusTemporaryRedirect, h.cfg.FrontendURL+"/auth?error="+url.QueryEscape(code))
}

func (h *Handler) exchangeCodeForToken(ctx context.Context, code string) (string, error) {
	form := url.Values{}
	form.Set("client_id", h.cfg.ClientID)
	form.Set("client_secret", h.cfg.ClientSecret)
	form.Set("code", code)
	form.Set("redirect_uri", h.cfg.RedirectURI)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		h.githubURL+"/login/oauth/access_token",
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "Hatch")

	resp, err := githubHTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("github token exchange failed with status %d", resp.StatusCode)
	}

	var result struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if result.Error != "" {
		return "", fmt.Errorf("github: %s", result.Error)
	}
	if strings.TrimSpace(result.AccessToken) == "" {
		return "", fmt.Errorf("github returned an empty access token")
	}

	return result.AccessToken, nil
}

func (h *Handler) fetchGitHubUser(ctx context.Context, token string) (*GitHubUser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.apiURL+"/user", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "Hatch")

	resp, err := githubHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("github profile fetch failed with status %d", resp.StatusCode)
	}

	var user GitHubUser
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, err
	}
	if user.ID <= 0 || strings.TrimSpace(user.Login) == "" {
		return nil, fmt.Errorf("github returned an invalid user profile")
	}

	return &user, nil
}

func setSessionCookie(c *gin.Context, token string, expires time.Time) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(time.Until(expires).Seconds()),
		Expires:  expires,
		HttpOnly: true,
		Secure:   isSecureRequest(c.Request),
		SameSite: http.SameSiteLaxMode,
	})
}

func clearSessionCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isSecureRequest(c.Request),
		SameSite: http.SameSiteLaxMode,
	})
}

func setOAuthStateCookie(c *gin.Context, state string) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     OAuthStateCookieName,
		Value:    state,
		Path:     "/auth/callback",
		MaxAge:   int((10 * time.Minute).Seconds()),
		Expires:  time.Now().Add(10 * time.Minute),
		HttpOnly: true,
		Secure:   isSecureRequest(c.Request),
		SameSite: http.SameSiteLaxMode,
	})
}

func clearOAuthStateCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     OAuthStateCookieName,
		Value:    "",
		Path:     "/auth/callback",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isSecureRequest(c.Request),
		SameSite: http.SameSiteLaxMode,
	})
}

func validOAuthState(c *gin.Context) bool {
	cookie, err := c.Cookie(OAuthStateCookieName)
	if err != nil {
		return false
	}
	state := c.Query("state")
	if state == "" || len(cookie) != len(state) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(cookie), []byte(state)) == 1
}

func generateOAuthState() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func isSecureRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}
