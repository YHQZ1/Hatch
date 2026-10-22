// Package githubapp acts as the Hatch GitHub App itself, rather than as a
// signed-in user: it signs the App's JWT and exchanges it for installation
// tokens, which are what Hatch hands to a build to clone a repository
// (ADR 0010). An installation token lasts one hour, is limited here to read
// access on a single repository, and is never stored.
package githubapp

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// ErrNotInstalled means the App is not installed on the repository, so there
// is nothing Hatch may read.
var ErrNotInstalled = errors.New("the Hatch GitHub App is not installed on this repository")

// jwtLifetime is how long the App's JWT is valid. GitHub allows at most ten
// minutes; a token is only ever used straight after it is made.
const jwtLifetime = 9 * time.Minute

// clockSkew backdates the JWT's issue time, as GitHub recommends, so a clock
// slightly ahead of GitHub's does not make the token "not yet valid".
const clockSkew = 60 * time.Second

// App signs in as the GitHub App.
type App struct {
	clientID string
	key      *rsa.PrivateKey

	// apiURL is GitHub's API origin; tests point it at a fake.
	apiURL string
	client *http.Client
	now    func() time.Time
}

// New returns an App. clientID is the App's Client ID (it starts with "Iv"),
// which GitHub accepts as the JWT issuer in place of the numeric App ID.
func New(clientID string, key *rsa.PrivateKey) *App {
	return &App{
		clientID: clientID,
		key:      key,
		apiURL:   "https://api.github.com",
		client:   &http.Client{Timeout: 12 * time.Second},
		now:      time.Now,
	}
}

// LoadKeyFile reads the App's private key, the .pem GitHub gives you once when
// you generate it.
func LoadKeyFile(path string) (*rsa.PrivateKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read GitHub App private key: %w", err)
	}
	return ParseKey(data)
}

// ParseKey reads a PEM encoded RSA private key, in either PKCS #1 (GitHub's
// format) or PKCS #8.
func ParseKey(data []byte) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, errors.New("GitHub App private key is not PEM encoded")
	}
	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, errors.New("GitHub App private key is not a valid RSA key")
	}
	key, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("GitHub App private key is not an RSA key")
	}
	return key, nil
}

// ParseRepoURL returns the owner and name from a GitHub repository URL such as
// https://github.com/owner/name or https://github.com/owner/name.git.
func ParseRepoURL(raw string) (owner, name string, err error) {
	parsed, parseErr := url.Parse(strings.TrimSpace(raw))
	if parseErr != nil || parsed.Scheme != "https" || !strings.EqualFold(parsed.Hostname(), "github.com") ||
		parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", "", fmt.Errorf("not a GitHub repository URL: %q", raw)
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", fmt.Errorf("not a GitHub repository URL: %q", raw)
	}
	return parts[0], strings.TrimSuffix(parts[1], ".git"), nil
}

// signedJWT returns the RS256 JWT that authenticates as the App.
func (a *App) signedJWT() (string, error) {
	now := a.now()
	header, err := json.Marshal(map[string]string{"alg": "RS256", "typ": "JWT"})
	if err != nil {
		return "", err
	}
	claims, err := json.Marshal(map[string]any{
		"iss": a.clientID,
		"iat": now.Add(-clockSkew).Unix(),
		"exp": now.Add(jwtLifetime).Unix(),
	})
	if err != nil {
		return "", err
	}

	encode := base64.RawURLEncoding.EncodeToString
	signingInput := encode(header) + "." + encode(claims)
	digest := sha256.Sum256([]byte(signingInput))
	signature, err := rsa.SignPKCS1v15(rand.Reader, a.key, crypto.SHA256, digest[:])
	if err != nil {
		return "", fmt.Errorf("sign GitHub App JWT: %w", err)
	}
	return signingInput + "." + encode(signature), nil
}

// InstallationToken returns a token that can read the contents of one
// repository, for use in a git clone. It returns ErrNotInstalled when the App
// is not installed on the repository.
func (a *App) InstallationToken(ctx context.Context, owner, name string) (string, error) {
	jwt, err := a.signedJWT()
	if err != nil {
		return "", err
	}

	var installation struct {
		ID int64 `json:"id"`
	}
	path := "/repos/" + url.PathEscape(owner) + "/" + url.PathEscape(name) + "/installation"
	status, err := a.do(ctx, http.MethodGet, path, jwt, nil, &installation)
	if status == http.StatusNotFound {
		return "", ErrNotInstalled
	}
	if err != nil {
		return "", fmt.Errorf("find the App installation for %s/%s: %w", owner, name, err)
	}

	body, err := json.Marshal(map[string]any{
		"repositories": []string{name},
		"permissions":  map[string]string{"contents": "read"},
	})
	if err != nil {
		return "", err
	}
	var issued struct {
		Token string `json:"token"`
	}
	path = fmt.Sprintf("/app/installations/%d/access_tokens", installation.ID)
	if _, err := a.do(ctx, http.MethodPost, path, jwt, body, &issued); err != nil {
		return "", fmt.Errorf("create an installation token for %s/%s: %w", owner, name, err)
	}
	if strings.TrimSpace(issued.Token) == "" {
		return "", errors.New("github returned an empty installation token")
	}
	return issued.Token, nil
}

// do makes one authenticated request and decodes a JSON response into out. It
// returns the HTTP status (zero if the request did not complete) alongside any
// error, so callers can tell "not found" from a failure. Response bodies are
// never put in errors: they can carry tokens.
func (a *App) do(ctx context.Context, method, path, jwt string, body []byte, out any) (int, error) {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, a.apiURL+path, reader)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+jwt)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "Hatch")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := a.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return resp.StatusCode, fmt.Errorf("github returned status %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return resp.StatusCode, fmt.Errorf("decode github response: %w", err)
	}
	return resp.StatusCode, nil
}
