package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type GitHubUser struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url"`
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

// GET /auth/github → redirects user to GitHub login page
func (h *Handler) RedirectToGitHub(c *gin.Context) {
	url := fmt.Sprintf(
		"https://github.com/login/oauth/authorize?client_id=%s&redirect_uri=%s&scope=repo,user",
		h.clientID,
		h.redirectURI,
	)
	c.Redirect(http.StatusTemporaryRedirect, url)
}

// GET /auth/callback → GitHub redirects here with a code
func (h *Handler) HandleCallback(c *gin.Context) {
	code := c.Query("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing code"})
		return
	}

	// exchange code for access token
	token, err := h.exchangeCodeForToken(code)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to exchange token"})
		return
	}

	// fetch github user info
	ghUser, err := h.fetchGitHubUser(token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch github user"})
		return
	}

	// upsert user into postgres
	dbUser, err := h.queries.CreateUser(c.Request.Context(), dbpkg.CreateUserParams{
		GithubID:       ghUser.ID,
		GithubUsername: ghUser.Login,
		AccessToken:    token,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save user"})
		return
	}

	// sign JWT with user's UUID
	jwtToken, err := h.signJWT(dbUser.ID, ghUser.ID, ghUser.Login, token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to sign token"})
		return
	}

	// redirect to frontend with JWT
	c.Redirect(http.StatusTemporaryRedirect, fmt.Sprintf("http://localhost:3000/auth/success?token=%s", jwtToken))
}

func (h *Handler) exchangeCodeForToken(code string) (string, error) {
	url := fmt.Sprintf(
		"https://github.com/login/oauth/access_token?client_id=%s&client_secret=%s&code=%s",
		h.clientID, h.clientSecret, code,
	)

	req, _ := http.NewRequestWithContext(context.Background(), http.MethodPost, url, nil)
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
		return "", fmt.Errorf("github error: %s", result.Error)
	}

	return result.AccessToken, nil
}

func (h *Handler) fetchGitHubUser(token string) (*GitHubUser, error) {
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://api.github.com/user", nil)
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
	claims := jwt.MapClaims{
		"user_id":      userID.String(),
		"github_id":    githubID,
		"username":     username,
		"access_token": accessToken,
		"exp":          time.Now().Add(24 * time.Hour).Unix(),
		"iat":          time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.jwtSecret))
}
