package auth

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/YHQZ1/hatch/internal/secrets"
	"github.com/gin-gonic/gin"
)

// Middleware requires a valid session cookie and puts the signed-in user in the
// request context (user_id, github_id, username, access_token).
func Middleware(sessions *Sessions, secretCodec *secrets.Codec) gin.HandlerFunc {
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

		accessToken, err := secretCodec.Decrypt(user.AccessToken)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "session secret unavailable"})
			return
		}

		c.Set("user_id", user.ID.String())
		c.Set("github_id", user.GithubID)
		c.Set("username", user.GithubUsername)
		c.Set("access_token", accessToken)

		if _, err := EnsureCSRFCookieWithError(c); err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to create csrf token"})
			return
		}

		c.Next()
	}
}
