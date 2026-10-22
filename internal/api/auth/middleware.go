package auth

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

const tokenSourceKey = "github_token_source"

// Middleware requires a valid session cookie and puts the signed-in user in the
// request context (user_id, github_id, username). The user's GitHub token is
// not fetched here: most requests never touch GitHub, and a GitHub outage must
// not break them. Handlers that need it call GitHubToken.
func Middleware(sessions *Sessions, tokens *Tokens) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie(SessionCookieName)
		if err != nil || token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		user, err := sessions.Lookup(c.Request.Context(), token)
		if errors.Is(err, ErrNoSession) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid session"})
			return
		}
		if err != nil {
			slog.ErrorContext(c.Request.Context(), "session lookup failed", "error", err)
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}

		c.Set("user_id", user.ID.String())
		c.Set("github_id", user.GithubID)
		c.Set("username", user.GithubUsername)

		var (
			cached string
			cache  error
			loaded bool
		)
		c.Set(tokenSourceKey, func() (string, error) {
			if !loaded {
				cached, cache = tokens.AccessToken(c.Request.Context(), user)
				loaded = true
			}
			return cached, cache
		})

		if _, err := EnsureCSRFCookieWithError(c); err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to create csrf token"})
			return
		}

		c.Next()
	}
}

// GitHubToken returns a valid GitHub access token for the signed-in user,
// renewing it if it has expired. It returns ErrReauthRequired when the user
// has to sign in again, and fails if the request did not pass Middleware.
func GitHubToken(c *gin.Context) (string, error) {
	source, ok := c.Get(tokenSourceKey)
	if !ok {
		return "", errors.New("no signed-in user on this request")
	}
	return source.(func() (string, error))()
}
