package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
	"github.com/YHQZ1/hatch/packages/secrets"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type GitHubUser struct {
	ID    int64  `json:"id"`
	Login string `json:"login"`
}

type Handler struct {
	clientID     string
	clientSecret string
	redirectURI  string
	frontendURL  string
	jwtSecret    string
	queries      *dbpkg.Queries
	secrets      *secrets.Codec
}

const SessionCookieName = "hatch_session"
const OAuthStateCookieName = "hatch_oauth_state"

var githubHTTPClient = &http.Client{Timeout: 12 * time.Second}

func NewHandler(clientID, clientSecret, redirectURI, frontendURL, jwtSecret string, db *sql.DB, secretCodec *secrets.Codec) *Handler {
	return &Handler{
		clientID:     clientID,
		clientSecret: clientSecret,
		redirectURI:  redirectURI,
		frontendURL:  strings.TrimRight(frontendURL, "/"),
		jwtSecret:    jwtSecret,
		queries:      dbpkg.New(db),
		secrets:      secretCodec,
	}
}

func (h *Handler) RedirectToGitHub(c *gin.Context) {
	state, err := generateOAuthState()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start oauth flow"})
		return
	}
	setOAuthStateCookie(c, state)

	params := url.Values{}
	params.Set("client_id", h.clientID)
	params.Set("redirect_uri", h.redirectURI)
	params.Set("scope", "repo,read:user")
	params.Set("state", state)

	c.Redirect(http.StatusTemporaryRedirect, "https://github.com/login/oauth/authorize?"+params.Encode())
}

func (h *Handler) HandleCallback(c *gin.Context) {
	if !validOAuthState(c) {
		clearOAuthStateCookie(c)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid oauth state"})
		return
	}
	clearOAuthStateCookie(c)

	code := c.Query("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing code"})
		return
	}

	token, err := h.exchangeCodeForToken(c.Request.Context(), code)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "token exchange failed"})
		return
	}

	ghUser, err := h.fetchGitHubUser(c.Request.Context(), token)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "github profile fetch failed"})
		return
	}

	storedToken, err := h.secrets.Encrypt(token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to secure github token"})
		return
	}

	dbUser, err := h.queries.CreateUser(c.Request.Context(), dbpkg.CreateUserParams{
		GithubID:       ghUser.ID,
		GithubUsername: ghUser.Login,
		AccessToken:    storedToken,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database sync failed"})
		return
	}

	jwtToken, err := h.signJWT(dbUser.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "session signing failed"})
		return
	}

	setSessionCookie(c, jwtToken)
	if _, err := EnsureCSRFCookieWithError(c); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create csrf token"})
		return
	}

	successURL := h.frontendURL + "/auth/success"
	c.Redirect(http.StatusTemporaryRedirect, successURL)
}

func (h *Handler) Logout(c *gin.Context) {
	clearSessionCookie(c)
	ClearCSRFCookie(c)
	c.Status(http.StatusNoContent)
}

func (h *Handler) exchangeCodeForToken(ctx context.Context, code string) (string, error) {
	form := url.Values{}
	form.Set("client_id", h.clientID)
	form.Set("client_secret", h.clientSecret)
	form.Set("code", code)
	form.Set("redirect_uri", h.redirectURI)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		"https://github.com/login/oauth/access_token",
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
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
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

func (h *Handler) signJWT(userID uuid.UUID) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID.String(),
		"exp":     time.Now().Add(24 * time.Hour).Unix(),
		"iat":     time.Now().Unix(),
	})
	return token.SignedString([]byte(h.jwtSecret))
}

func setSessionCookie(c *gin.Context, token string) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int((24 * time.Hour).Seconds()),
		Expires:  time.Now().Add(24 * time.Hour),
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
