package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/YHQZ1/hatch/internal/logging"
)

// RequestIDHeader carries the request ID on requests and responses.
const RequestIDHeader = "X-Request-ID"

// RequestID gives every request an ID, returns it in the X-Request-ID response
// header, and adds it to every log line made while handling the request (log
// with slog.InfoContext(c.Request.Context(), ...)). A caller's own ID is kept
// when it is short and plain, so it can be followed across systems.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(RequestIDHeader)
		if !validRequestID(id) {
			id = newRequestID()
		}
		c.Header(RequestIDHeader, id)
		c.Request = c.Request.WithContext(
			logging.WithAttrs(c.Request.Context(), slog.String("request_id", id)),
		)
		c.Next()
	}
}

func validRequestID(id string) bool {
	if id == "" || len(id) > 64 {
		return false
	}
	for _, r := range id {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_', r == '.':
		default:
			return false
		}
	}
	return true
}

func newRequestID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

// AccessLog logs one structured line per request after it is handled. It logs
// the path but never the query string, which can carry OAuth codes and tokens.
// Server errors are logged at error level, client errors at warn, and health
// checks and static assets at debug so they do not drown out real traffic.
func AccessLog() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		path := c.Request.URL.Path
		status := c.Writer.Status()
		attrs := []slog.Attr{
			slog.String("method", c.Request.Method),
			slog.String("path", path),
			slog.String("route", c.FullPath()),
			slog.Int("status", status),
			slog.Float64("duration_ms", float64(time.Since(start).Microseconds())/1000),
			slog.Int("bytes", c.Writer.Size()),
			slog.String("client_ip", c.ClientIP()),
		}
		if userID, ok := c.Get("user_id"); ok {
			attrs = append(attrs, slog.Any("user_id", userID))
		}
		slog.LogAttrs(c.Request.Context(), requestLevel(status, path), "request", attrs...)
	}
}

func requestLevel(status int, path string) slog.Level {
	switch {
	case path == "/health" || path == "/ready" || strings.HasPrefix(path, "/assets/"):
		return slog.LevelDebug
	case status >= http.StatusInternalServerError:
		return slog.LevelError
	case status >= http.StatusBadRequest:
		return slog.LevelWarn
	default:
		return slog.LevelInfo
	}
}

// Recovery turns a panic in a handler into a logged error and a 500, so one
// bad request cannot take the process down. The panic and its stack go through
// the structured logger instead of Gin's default writer.
func Recovery() gin.HandlerFunc {
	return gin.CustomRecoveryWithWriter(io.Discard, func(c *gin.Context, recovered any) {
		slog.ErrorContext(c.Request.Context(), "panic while handling a request",
			"panic", fmt.Sprint(recovered),
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"stack", string(debug.Stack()),
		)
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
	})
}
