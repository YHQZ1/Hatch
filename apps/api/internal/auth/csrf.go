package auth

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	CSRFCookieName = "hatch_csrf"
	CSRFHeaderName = "X-CSRF-Token"
)

func CSRFMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !requiresCSRFAuth(c.Request.Method) || usesBearerAuth(c) {
			c.Next()
			return
		}

		cookieToken, err := c.Cookie(CSRFCookieName)
		if err != nil || cookieToken == "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "missing csrf token"})
			return
		}

		headerToken := strings.TrimSpace(c.GetHeader(CSRFHeaderName))
		if headerToken == "" || headerToken != cookieToken {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "invalid csrf token"})
			return
		}

		c.Next()
	}
}

func EnsureCSRFCookie(c *gin.Context) string {
	if existing, err := c.Cookie(CSRFCookieName); err == nil && existing != "" {
		return existing
	}

	token := mustGenerateCSRFToken()
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     CSRFCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int((24 * time.Hour).Seconds()),
		HttpOnly: false,
		Secure:   isSecureRequest(c.Request),
		SameSite: http.SameSiteLaxMode,
	})
	return token
}

func ClearCSRFCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     CSRFCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: false,
		Secure:   isSecureRequest(c.Request),
		SameSite: http.SameSiteLaxMode,
	})
}

func requiresCSRFAuth(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return false
	default:
		return true
	}
}

func usesBearerAuth(c *gin.Context) bool {
	return strings.HasPrefix(c.GetHeader("Authorization"), "Bearer ")
}

func mustGenerateCSRFToken() string {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}
	return hex.EncodeToString(buf)
}
