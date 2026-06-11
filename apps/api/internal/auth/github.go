package auth

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
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
	jwtSecret    string
	queries      *dbpkg.Queries
	secrets      *secrets.Codec
}

const SessionCookieName = "hatch_session"
const OAuthStateCookieName = "hatch_oauth_state"

var githubHTTPClient = &http.Client{Timeout: 12 * time.Second}

func NewHandler(clientID, clientSecret, redirectURI, jwtSecret string, db *sql.DB, secretCodec *secrets.Codec) *Handler {
	return &Handler{
		clientID:     clientID,
		clientSecret: clientSecret,
		redirectURI:  redirectURI,
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
	params.Set("scope", "repo,user")
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

	token, err := h.exchangeCodeForToken(code)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "token exchange failed"})
		return
	}

	ghUser, err := h.fetchGitHubUser(token)
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
	EnsureCSRFCookie(c)

	successURL := fmt.Sprintf("%s/auth/success", os.Getenv("FRONTEND_URL"))
	c.Redirect(http.StatusTemporaryRedirect, successURL)
}

func (h *Handler) Logout(c *gin.Context) {
	clearSessionCookie(c)
	ClearCSRFCookie(c)
	c.Status(http.StatusNoContent)
}

func (h *Handler) exchangeCodeForToken(code string) (string, error) {
	url := fmt.Sprintf(
		"https://github.com/login/oauth/access_token?client_id=%s&client_secret=%s&code=%s",
		h.clientID, h.clientSecret, code,
	)

	req, err := http.NewRequest(http.MethodPost, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")

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

	return result.AccessToken, nil
}

func (h *Handler) fetchGitHubUser(token string) (*GitHubUser, error) {
	req, err := http.NewRequest(http.MethodGet, "https://api.github.com/user", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")

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
	return state != "" && cookie == state
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
