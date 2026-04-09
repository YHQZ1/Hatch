package auth

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
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
}

func NewHandler(clientID, clientSecret, redirectURI, jwtSecret string, db *sql.DB) *Handler {
	return &Handler{
		clientID:     clientID,
		clientSecret: clientSecret,
		redirectURI:  redirectURI,
		jwtSecret:    jwtSecret,
		queries:      dbpkg.New(db),
	}
}

func (h *Handler) RedirectToGitHub(c *gin.Context) {
	url := fmt.Sprintf(
		"https://github.com/login/oauth/authorize?client_id=%s&redirect_uri=%s&scope=repo,user",
		h.clientID,
		h.redirectURI,
	)
	c.Redirect(http.StatusTemporaryRedirect, url)
}

func (h *Handler) HandleCallback(c *gin.Context) {
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

	dbUser, err := h.queries.CreateUser(c.Request.Context(), dbpkg.CreateUserParams{
		GithubID:       ghUser.ID,
		GithubUsername: ghUser.Login,
		AccessToken:    token,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database sync failed"})
		return
	}

	jwtToken, err := h.signJWT(dbUser.ID, ghUser.ID, ghUser.Login, token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "session signing failed"})
		return
	}

	successURL := fmt.Sprintf("%s/auth/success?token=%s", os.Getenv("FRONTEND_URL"), jwtToken)
	c.Redirect(http.StatusTemporaryRedirect, successURL)
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

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

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

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var user GitHubUser
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, err
	}

	return &user, nil
}

func (h *Handler) signJWT(userID uuid.UUID, githubID int64, username, accessToken string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id":      userID.String(),
		"github_id":    githubID,
		"username":     username,
		"access_token": accessToken,
		"exp":          time.Now().Add(24 * time.Hour).Unix(),
		"iat":          time.Now().Unix(),
	})
	return token.SignedString([]byte(h.jwtSecret))
}
