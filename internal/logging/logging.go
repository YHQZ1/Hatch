// Package logging sets up Hatch's structured logger.
//
// Everything logs through log/slog. In production the output is JSON, one
// object per line, so log tools can index the fields; otherwise it is the
// readable key=value text format. Code that still uses the standard log
// package is routed through the same handler, so its output has the same shape
// (as plain messages) instead of a second format.
package logging

import (
	"context"
	"io"
	"log/slog"
	"os"
	"strings"
)

// Setup builds the logger for the environment ("production" gives JSON) and
// level ("debug", "info", "warn", or "error"; anything else means info), makes
// it the default for slog and the standard log package, and returns it.
func Setup(w io.Writer, environment, level string) *slog.Logger {
	opts := &slog.HandlerOptions{Level: parseLevel(level)}

	var handler slog.Handler
	if environment == "production" {
		handler = slog.NewJSONHandler(w, opts)
	} else {
		handler = slog.NewTextHandler(w, opts)
	}

	logger := slog.New(&contextHandler{inner: handler})
	slog.SetDefault(logger)
	return logger
}

// SetupFromEnv calls Setup with ENVIRONMENT and LOG_LEVEL, writing to stderr.
func SetupFromEnv() *slog.Logger {
	return Setup(os.Stderr, os.Getenv("ENVIRONMENT"), os.Getenv("LOG_LEVEL"))
}

func parseLevel(level string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

type contextKey struct{}

// WithAttrs returns a context whose attributes are added to every record
// logged with it (through slog.InfoContext and the like). The request logger
// uses it to put the request ID on every line a request produces.
func WithAttrs(ctx context.Context, attrs ...slog.Attr) context.Context {
	existing, _ := ctx.Value(contextKey{}).([]slog.Attr)
	merged := make([]slog.Attr, 0, len(existing)+len(attrs))
	merged = append(merged, existing...)
	merged = append(merged, attrs...)
	return context.WithValue(ctx, contextKey{}, merged)
}

// contextHandler adds the attributes stored in the context to each record.
type contextHandler struct {
	inner slog.Handler
}

func (h *contextHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.inner.Enabled(ctx, level)
}

func (h *contextHandler) Handle(ctx context.Context, record slog.Record) error {
	if attrs, ok := ctx.Value(contextKey{}).([]slog.Attr); ok {
		record.AddAttrs(attrs...)
	}
	return h.inner.Handle(ctx, record)
}

func (h *contextHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &contextHandler{inner: h.inner.WithAttrs(attrs)}
}

func (h *contextHandler) WithGroup(name string) slog.Handler {
	return &contextHandler{inner: h.inner.WithGroup(name)}
}
