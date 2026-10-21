package auth

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/YHQZ1/hatch/internal/store"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/YHQZ1/hatch/internal/store/storetest"
)

// newTestSessions returns Sessions over a migrated database, with a clock the
// test controls.
func newTestSessions(t *testing.T) (*Sessions, *sql.DB, *time.Time) {
	t.Helper()
	url := storetest.NewDatabase(t)
	if _, err := store.Migrate(url); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	db, err := store.Connect(url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	now := time.Now()
	sessions := NewSessions(db)
	sessions.now = func() time.Time { return now }
	return sessions, db, &now
}

func newTestUser(t *testing.T, db *sql.DB, githubID int64, name string) dbpkg.User {
	t.Helper()
	user, err := dbpkg.New(db).CreateUser(context.Background(), dbpkg.CreateUserParams{
		GithubID: githubID, GithubUsername: name, AccessToken: "token",
	})
	if err != nil {
		t.Fatal(err)
	}
	return user
}

func TestSessionRoundTrip(t *testing.T) {
	ctx := context.Background()
	sessions, db, _ := newTestSessions(t)
	user := newTestUser(t, db, 1, "octocat")

	token, expires, err := sessions.Create(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(token) < 40 {
		t.Fatalf("token %q is too short to be a 256-bit secret", token)
	}
	if !expires.After(time.Now().Add(sessionLifetime - time.Minute)) {
		t.Fatalf("expires = %v, want about %v from now", expires, sessionLifetime)
	}

	got, err := sessions.Lookup(ctx, token)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != user.ID || got.GithubUsername != "octocat" {
		t.Fatalf("Lookup() = %+v, want user %v", got, user.ID)
	}
}

func TestSessionTokenIsNotStored(t *testing.T) {
	ctx := context.Background()
	sessions, db, _ := newTestSessions(t)
	user := newTestUser(t, db, 1, "octocat")

	token, _, err := sessions.Create(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}

	// The database holds only the hash, so the token itself finds nothing.
	if _, err := dbpkg.New(db).GetSessionByTokenHash(ctx, []byte(token)); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("raw token matched a stored hash: %v", err)
	}
	if _, err := dbpkg.New(db).GetSessionByTokenHash(ctx, hashToken(token)); err != nil {
		t.Fatalf("hash of the token not stored: %v", err)
	}
}

func TestSessionTokensAreUnique(t *testing.T) {
	ctx := context.Background()
	sessions, db, _ := newTestSessions(t)
	user := newTestUser(t, db, 1, "octocat")

	a, _, _ := sessions.Create(ctx, user.ID)
	b, _, _ := sessions.Create(ctx, user.ID)
	if a == b {
		t.Fatal("two sessions share a token")
	}
}

func TestSessionRejectsUnknownAndEmptyTokens(t *testing.T) {
	sessions, _, _ := newTestSessions(t)

	for _, token := range []string{"", "not-a-session", "eyJhbGciOiJIUzI1NiJ9.e30.signature"} {
		if _, err := sessions.Lookup(context.Background(), token); !errors.Is(err, ErrNoSession) {
			t.Errorf("Lookup(%q) error = %v, want ErrNoSession", token, err)
		}
	}
}

func TestSessionExpires(t *testing.T) {
	ctx := context.Background()
	sessions, db, now := newTestSessions(t)
	user := newTestUser(t, db, 1, "octocat")
	token, _, err := sessions.Create(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}

	// Used every few days, the session still ends at its fixed lifetime.
	for elapsed := 4 * 24 * time.Hour; elapsed < sessionLifetime; elapsed += 4 * 24 * time.Hour {
		*now = (*now).Add(4 * 24 * time.Hour)
		if _, err := sessions.Lookup(ctx, token); err != nil {
			t.Fatalf("session should be valid %v in: %v", elapsed, err)
		}
	}
	*now = (*now).Add(sessionLifetime)
	if _, err := sessions.Lookup(ctx, token); !errors.Is(err, ErrNoSession) {
		t.Fatalf("Lookup() after lifetime error = %v, want ErrNoSession", err)
	}
}

func TestSessionEndsWhenIdle(t *testing.T) {
	ctx := context.Background()
	sessions, db, now := newTestSessions(t)
	user := newTestUser(t, db, 1, "octocat")
	token, _, _ := sessions.Create(ctx, user.ID)

	*now = (*now).Add(sessionIdleTimeout + time.Hour)
	if _, err := sessions.Lookup(ctx, token); !errors.Is(err, ErrNoSession) {
		t.Fatalf("Lookup() after idle timeout error = %v, want ErrNoSession", err)
	}
}

func TestSessionTouchIsThrottled(t *testing.T) {
	ctx := context.Background()
	sessions, db, now := newTestSessions(t)
	user := newTestUser(t, db, 1, "octocat")
	token, _, _ := sessions.Create(ctx, user.ID)
	q := dbpkg.New(db)
	lastSeen := func() time.Time {
		session, err := q.GetSessionByTokenHash(ctx, hashToken(token))
		if err != nil {
			t.Fatal(err)
		}
		return session.LastSeenAt
	}
	created := lastSeen()

	*now = (*now).Add(time.Minute)
	if _, err := sessions.Lookup(ctx, token); err != nil {
		t.Fatal(err)
	}
	if !lastSeen().Equal(created) {
		t.Fatal("last_seen_at was written again within the touch interval")
	}

	*now = (*now).Add(touchInterval)
	if _, err := sessions.Lookup(ctx, token); err != nil {
		t.Fatal(err)
	}
	if !lastSeen().After(created) {
		t.Fatal("last_seen_at was not refreshed after the touch interval")
	}
}

func TestSessionDelete(t *testing.T) {
	ctx := context.Background()
	sessions, db, _ := newTestSessions(t)
	user := newTestUser(t, db, 1, "octocat")
	keep, _, _ := sessions.Create(ctx, user.ID)
	drop, _, _ := sessions.Create(ctx, user.ID)

	if err := sessions.Delete(ctx, drop); err != nil {
		t.Fatal(err)
	}
	if err := sessions.Delete(ctx, "unknown"); err != nil {
		t.Fatalf("deleting an unknown token should not fail: %v", err)
	}
	if _, err := sessions.Lookup(ctx, drop); !errors.Is(err, ErrNoSession) {
		t.Fatalf("deleted session still valid: %v", err)
	}
	if _, err := sessions.Lookup(ctx, keep); err != nil {
		t.Fatalf("other session should survive: %v", err)
	}
}

func TestDeleteExpiredKeepsActiveSessions(t *testing.T) {
	ctx := context.Background()
	sessions, db, now := newTestSessions(t)
	user := newTestUser(t, db, 1, "octocat")
	old, _, _ := sessions.Create(ctx, user.ID)

	*now = (*now).Add(sessionLifetime + time.Hour)
	fresh, _, _ := sessions.Create(ctx, user.ID)

	removed, err := sessions.DeleteExpired(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 1 {
		t.Fatalf("removed %d sessions, want 1", removed)
	}
	if _, err := sessions.Lookup(ctx, old); !errors.Is(err, ErrNoSession) {
		t.Fatalf("expired session still valid: %v", err)
	}
	if _, err := sessions.Lookup(ctx, fresh); err != nil {
		t.Fatalf("active session was removed: %v", err)
	}
}

func TestSessionsEndWithTheirUser(t *testing.T) {
	ctx := context.Background()
	sessions, db, _ := newTestSessions(t)
	user := newTestUser(t, db, 1, "octocat")
	token, _, _ := sessions.Create(ctx, user.ID)

	if _, err := db.ExecContext(ctx, `DELETE FROM users WHERE id = $1`, user.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := sessions.Lookup(ctx, token); !errors.Is(err, ErrNoSession) {
		t.Fatalf("session outlived its user: %v", err)
	}
}
