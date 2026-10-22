package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/YHQZ1/hatch/internal/secrets"
	dbpkg "github.com/YHQZ1/hatch/internal/store/db"
	"github.com/google/uuid"
)

// refreshMargin is how long before expiry a token is renewed, so that a token
// is never handed out that dies while a request is using it.
const refreshMargin = 2 * time.Minute

// ErrReauthRequired means Hatch can no longer act for the user on GitHub: the
// refresh token is missing, expired, or was rejected. The user has to sign in
// again.
var ErrReauthRequired = errors.New("github authorization has expired; sign in again")

// grant is what GitHub returns when it issues or renews a user token.
type grant struct {
	AccessToken  string
	RefreshToken string
	// ExpiresIn and RefreshExpiresIn are in seconds; zero means the token does
	// not expire.
	ExpiresIn        int64
	RefreshExpiresIn int64
}

// requestGrant asks GitHub's token endpoint for a user token. form carries the
// grant type: an authorization code at sign-in, a refresh token afterwards.
func requestGrant(ctx context.Context, githubURL string, form url.Values) (*grant, error) {
	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		githubURL+"/login/oauth/access_token",
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "Hatch")

	resp, err := githubHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("github token request failed with status %d", resp.StatusCode)
	}

	var result struct {
		AccessToken      string `json:"access_token"`
		RefreshToken     string `json:"refresh_token"`
		ExpiresIn        int64  `json:"expires_in"`
		RefreshExpiresIn int64  `json:"refresh_token_expires_in"`
		Error            string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if result.Error == "bad_refresh_token" {
		return nil, ErrReauthRequired
	}
	if result.Error != "" {
		return nil, fmt.Errorf("github: %s", result.Error)
	}
	if strings.TrimSpace(result.AccessToken) == "" {
		return nil, fmt.Errorf("github returned an empty access token")
	}

	return &grant{
		AccessToken:      result.AccessToken,
		RefreshToken:     result.RefreshToken,
		ExpiresIn:        result.ExpiresIn,
		RefreshExpiresIn: result.RefreshExpiresIn,
	}, nil
}

// storedTokens is a grant as it is kept in the users table: tokens encrypted,
// expiry as times.
type storedTokens struct {
	accessToken      string
	refreshToken     sql.NullString
	accessExpiresAt  sql.NullTime
	refreshExpiresAt sql.NullTime
}

func sealGrant(codec *secrets.Codec, g *grant, now time.Time) (storedTokens, error) {
	var stored storedTokens
	var err error
	if stored.accessToken, err = codec.Encrypt(g.AccessToken); err != nil {
		return storedTokens{}, err
	}
	if g.RefreshToken != "" {
		sealed, err := codec.Encrypt(g.RefreshToken)
		if err != nil {
			return storedTokens{}, err
		}
		stored.refreshToken = sql.NullString{String: sealed, Valid: true}
	}
	if g.ExpiresIn > 0 {
		stored.accessExpiresAt = sql.NullTime{Time: now.Add(time.Duration(g.ExpiresIn) * time.Second), Valid: true}
	}
	if g.RefreshExpiresIn > 0 {
		stored.refreshExpiresAt = sql.NullTime{Time: now.Add(time.Duration(g.RefreshExpiresIn) * time.Second), Valid: true}
	}
	return stored, nil
}

// Tokens hands out GitHub user access tokens, renewing them when they are
// about to expire. A GitHub App user token lasts 8 hours; its refresh token is
// single-use, so renewal is serialized per user with a row lock.
type Tokens struct {
	db           *sql.DB
	queries      *dbpkg.Queries
	secrets      *secrets.Codec
	clientID     string
	clientSecret string
	githubURL    string
	now          func() time.Time
}

func NewTokens(db *sql.DB, codec *secrets.Codec, clientID, clientSecret string) *Tokens {
	return &Tokens{
		db:           db,
		queries:      dbpkg.New(db),
		secrets:      codec,
		clientID:     clientID,
		clientSecret: clientSecret,
		githubURL:    "https://github.com",
		now:          time.Now,
	}
}

// AccessToken returns a valid access token for the user, renewing it first
// when it has expired or is about to. It returns ErrReauthRequired when the
// user has to sign in again.
func (t *Tokens) AccessToken(ctx context.Context, user dbpkg.User) (string, error) {
	if !t.needsRefresh(user) {
		return t.secrets.Decrypt(user.AccessToken)
	}
	return t.refresh(ctx, user.ID)
}

// needsRefresh is false for a token with no recorded expiry: those predate
// token expiry and are used as they are until GitHub rejects them.
func (t *Tokens) needsRefresh(user dbpkg.User) bool {
	return user.AccessTokenExpiresAt.Valid &&
		!t.now().Add(refreshMargin).Before(user.AccessTokenExpiresAt.Time)
}

func (t *Tokens) refresh(ctx context.Context, userID uuid.UUID) (string, error) {
	tx, err := t.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("begin token refresh: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	q := t.queries.WithTx(tx)

	user, err := q.GetUserByIDForUpdate(ctx, userID)
	if err != nil {
		return "", fmt.Errorf("lock user for token refresh: %w", err)
	}
	// A concurrent request may have renewed the token while this one waited for
	// the lock.
	if !t.needsRefresh(user) {
		if err := tx.Commit(); err != nil {
			return "", fmt.Errorf("commit token refresh: %w", err)
		}
		return t.secrets.Decrypt(user.AccessToken)
	}

	if !user.RefreshToken.Valid ||
		(user.RefreshTokenExpiresAt.Valid && !t.now().Before(user.RefreshTokenExpiresAt.Time)) {
		return "", ErrReauthRequired
	}
	refreshToken, err := t.secrets.Decrypt(user.RefreshToken.String)
	if err != nil {
		return "", fmt.Errorf("decrypt refresh token: %w", err)
	}

	form := url.Values{}
	form.Set("client_id", t.clientID)
	form.Set("client_secret", t.clientSecret)
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)
	renewed, err := requestGrant(ctx, t.githubURL, form)
	if err != nil {
		return "", err
	}

	stored, err := sealGrant(t.secrets, renewed, t.now())
	if err != nil {
		return "", fmt.Errorf("encrypt renewed tokens: %w", err)
	}
	if err := q.UpdateUserTokens(ctx, dbpkg.UpdateUserTokensParams{
		ID:                    user.ID,
		AccessToken:           stored.accessToken,
		RefreshToken:          stored.refreshToken,
		AccessTokenExpiresAt:  stored.accessExpiresAt,
		RefreshTokenExpiresAt: stored.refreshExpiresAt,
	}); err != nil {
		return "", fmt.Errorf("save renewed tokens: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("commit token refresh: %w", err)
	}
	return renewed.AccessToken, nil
}
