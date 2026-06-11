package auth

import (
	"database/sql"
	"net/http"
	"strings"

	dbpkg "github.com/YHQZ1/hatch/packages/db/gen"
	"github.com/YHQZ1/hatch/packages/secrets"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func Middleware(jwtSecret string, db *sql.DB, secretCodec *secrets.Codec) gin.HandlerFunc {
	queries := dbpkg.New(db)

	return func(c *gin.Context) {
		tokenStr, ok := tokenFromRequest(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid session"})
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid session claims"})
			return
		}

		userIDRaw, ok := claims["user_id"].(string)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid session claims"})
			return
		}
		userID, err := uuid.Parse(userIDRaw)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid session claims"})
			return
		}

		user, err := queries.GetUserByID(c.Request.Context(), userID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "session user not found"})
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

		if !usesBearerAuth(c) {
			EnsureCSRFCookie(c)
		}

		c.Next()
	}
}

func tokenFromRequest(c *gin.Context) (string, bool) {
	authHeader := c.GetHeader("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		token := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		return token, token != ""
	}

	cookie, err := c.Cookie(SessionCookieName)
	if err != nil || cookie == "" {
		return "", false
	}
	return cookie, true
}
