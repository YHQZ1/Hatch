package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/google/uuid"
)

const (
	// sessionLifetime is how long a session lasts from sign-in, regardless of
	// activity.
	sessionLifetime = 30 * 24 * time.Hour
	// sessionIdleTimeout ends a session that has not been used for this long.
	sessionIdleTimeout = 7 * 24 * time.Hour
	// touchInterval limits how often last_seen_at is written.
	touchInterval = 5 * time.Minute
)

// ErrNoSession means the session token is missing, unknown, or expired.
var ErrNoSession = errors.New("no valid session")

// Sessions creates and checks server-side sessions (ADR 0013). A session's ID
// is a random secret held only in the user's cookie; the database stores just
// its SHA-256 hash.
type Sessions struct {
	queries *dbpkg.Queries
	now     func() time.Time
}

func NewSessions(db *sql.DB) *Sessions {
	return &Sessions{queries: dbpkg.New(db), now: time.Now}
}

// Create starts a session for the user and returns the token to put in the
// cookie and the time the session ends.
func (s *Sessions) Create(ctx context.Context, userID uuid.UUID) (token string, expires time.Time, err error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, fmt.Errorf("generate session token: %w", err)
	}
	token = base64.RawURLEncoding.EncodeToString(raw)

	now := s.now()
	expires = now.Add(sessionLifetime)
	if _, err := s.queries.CreateSession(ctx, dbpkg.CreateSessionParams{
		UserID:     userID,
		TokenHash:  hashToken(token),
		LastSeenAt: now,
		ExpiresAt:  expires,
	}); err != nil {
		return "", time.Time{}, fmt.Errorf("create session: %w", err)
	}
	return token, expires, nil
}

// Lookup returns the user a session token belongs to, or ErrNoSession when
// the token is unknown or the session has expired. Valid use refreshes the
// idle timer, at most once per touchInterval.
func (s *Sessions) Lookup(ctx context.Context, token string) (dbpkg.User, error) {
	if token == "" {
		return dbpkg.User{}, ErrNoSession
	}
	session, err := s.queries.GetSessionByTokenHash(ctx, hashToken(token))
	if errors.Is(err, sql.ErrNoRows) {
		return dbpkg.User{}, ErrNoSession
	}
	if err != nil {
		return dbpkg.User{}, fmt.Errorf("look up session: %w", err)
	}

	now := s.now()
	if !now.Before(session.ExpiresAt) || now.Sub(session.LastSeenAt) > sessionIdleTimeout {
		return dbpkg.User{}, ErrNoSession
	}

	user, err := s.queries.GetUserByID(ctx, session.UserID)
	if errors.Is(err, sql.ErrNoRows) {
		return dbpkg.User{}, ErrNoSession
	}
	if err != nil {
		return dbpkg.User{}, fmt.Errorf("load session user: %w", err)
	}

	if now.Sub(session.LastSeenAt) >= touchInterval {
		if err := s.queries.TouchSession(ctx, dbpkg.TouchSessionParams{ID: session.ID, LastSeenAt: now}); err != nil {
			return dbpkg.User{}, fmt.Errorf("refresh session: %w", err)
		}
	}
	return user, nil
}

// Delete ends the session the token belongs to. An unknown token is not an
// error.
func (s *Sessions) Delete(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	if err := s.queries.DeleteSessionByTokenHash(ctx, hashToken(token)); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

// DeleteExpired removes sessions that have ended and returns how many.
func (s *Sessions) DeleteExpired(ctx context.Context) (int64, error) {
	now := s.now()
	return s.queries.DeleteExpiredSessions(ctx, dbpkg.DeleteExpiredSessionsParams{
		ExpiresAt:  now,
		LastSeenAt: now.Add(-sessionIdleTimeout),
	})
}

func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}
