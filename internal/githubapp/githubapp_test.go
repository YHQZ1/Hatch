package githubapp

import (
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
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	return key
}

// fakeGitHub answers the two App endpoints and checks the JWT it is sent.
type fakeGitHub struct {
	t      *testing.T
	pub    *rsa.PublicKey
	server *httptest.Server

	installed      bool
	tokenStatus    int
	issuedBody     map[string]any
	installationID int64
}

func newFakeGitHub(t *testing.T, key *rsa.PrivateKey) *fakeGitHub {
	f := &fakeGitHub{t: t, pub: &key.PublicKey, installed: true, installationID: 777}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /repos/{owner}/{name}/installation", func(w http.ResponseWriter, r *http.Request) {
		f.checkJWT(r)
		if !f.installed {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": f.installationID})
	})
	mux.HandleFunc("POST /app/installations/{id}/access_tokens", func(w http.ResponseWriter, r *http.Request) {
		f.checkJWT(r)
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &f.issuedBody)
		if r.PathValue("id") != "777" {
			t.Errorf("token requested for installation %s", r.PathValue("id"))
		}
		if f.tokenStatus != 0 {
			w.WriteHeader(f.tokenStatus)
			return
		}
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{"token": "ghs_installation", "expires_at": "2026-10-22T04:00:00Z"})
	})
	f.server = httptest.NewServer(mux)
	t.Cleanup(f.server.Close)
	return f
}

// checkJWT verifies the request is signed by the App's key and has the claims
// GitHub requires.
func (f *fakeGitHub) checkJWT(r *http.Request) {
	f.t.Helper()
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		f.t.Error("no bearer token")
		return
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		f.t.Errorf("JWT has %d parts", len(parts))
		return
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		f.t.Errorf("signature: %v", err)
		return
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if err := rsa.VerifyPKCS1v15(f.pub, crypto.SHA256, digest[:], signature); err != nil {
		f.t.Errorf("JWT is not signed by the App's key: %v", err)
	}

	var header map[string]string
	var claims struct {
		Iss string `json:"iss"`
		Iat int64  `json:"iat"`
		Exp int64  `json:"exp"`
	}
	decode := func(part string, into any) {
		raw, err := base64.RawURLEncoding.DecodeString(part)
		if err == nil {
			err = json.Unmarshal(raw, into)
		}
		if err != nil {
			f.t.Errorf("decode JWT part: %v", err)
		}
	}
	decode(parts[0], &header)
	decode(parts[1], &claims)
	if header["alg"] != "RS256" {
		f.t.Errorf("alg = %q, want RS256", header["alg"])
	}
	if claims.Iss != "Iv23liTESTCLIENT" {
		f.t.Errorf("iss = %q, want the client ID", claims.Iss)
	}
	if claims.Iat > time.Now().Unix()-30 {
		f.t.Errorf("iat is not backdated for clock skew")
	}
	if lifetime := claims.Exp - time.Now().Unix(); lifetime <= 0 || lifetime > 600 {
		f.t.Errorf("JWT lifetime = %ds, GitHub allows at most 600", lifetime)
	}
}

func newApp(t *testing.T) (*App, *fakeGitHub) {
	key := testKey(t)
	fake := newFakeGitHub(t, key)
	app := New("Iv23liTESTCLIENT", key)
	app.apiURL = fake.server.URL
	return app, fake
}

func TestInstallationTokenIsScopedToOneRepositoryWithReadAccess(t *testing.T) {
	app, fake := newApp(t)

	token, err := app.InstallationToken(context.Background(), "octocat", "hello")

	if err != nil || token != "ghs_installation" {
		t.Fatalf("token = %q, %v", token, err)
	}
	repos, _ := fake.issuedBody["repositories"].([]any)
	if len(repos) != 1 || repos[0] != "hello" {
		t.Errorf("repositories = %v, want only hello", fake.issuedBody["repositories"])
	}
	perms, _ := fake.issuedBody["permissions"].(map[string]any)
	if len(perms) != 1 || perms["contents"] != "read" {
		t.Errorf("permissions = %v, want only contents:read", fake.issuedBody["permissions"])
	}
}

func TestInstallationTokenWhenTheAppIsNotInstalled(t *testing.T) {
	app, fake := newApp(t)
	fake.installed = false

	_, err := app.InstallationToken(context.Background(), "octocat", "hello")

	if !errors.Is(err, ErrNotInstalled) {
		t.Fatalf("err = %v, want ErrNotInstalled", err)
	}
}

func TestInstallationTokenFailureDoesNotLeakTheResponse(t *testing.T) {
	app, fake := newApp(t)
	fake.tokenStatus = http.StatusInternalServerError

	_, err := app.InstallationToken(context.Background(), "octocat", "hello")

	if err == nil || errors.Is(err, ErrNotInstalled) {
		t.Fatalf("err = %v, want a plain failure", err)
	}
	if !strings.Contains(err.Error(), "500") {
		t.Errorf("err = %v, want the status", err)
	}
}

func TestParseRepoURL(t *testing.T) {
	tests := []struct {
		in          string
		owner, name string
		ok          bool
	}{
		{"https://github.com/octocat/hello", "octocat", "hello", true},
		{"https://github.com/octocat/hello.git", "octocat", "hello", true},
		{"https://github.com/octocat/hello/", "octocat", "hello", true},
		{"https://GitHub.com/octocat/hello", "octocat", "hello", true},
		{"https://github.com/octocat", "", "", false},
		{"https://github.com/octocat/hello/tree/main", "", "", false},
		{"https://evil.example/octocat/hello", "", "", false},
		{"https://token@github.com/octocat/hello", "", "", false},
		{"http://github.com/octocat/hello", "", "", false},
		{"git@github.com:octocat/hello.git", "", "", false},
		{"", "", "", false},
	}
	for _, tt := range tests {
		owner, name, err := ParseRepoURL(tt.in)
		if (err == nil) != tt.ok || owner != tt.owner || name != tt.name {
			t.Errorf("ParseRepoURL(%q) = %q, %q, %v", tt.in, owner, name, err)
		}
	}
}

func TestParseKeyAcceptsGitHubsFormatAndPKCS8(t *testing.T) {
	key := testKey(t)
	pkcs1 := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	pkcs8 := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})

	for name, data := range map[string][]byte{"pkcs1": pkcs1, "pkcs8": pkcs8} {
		got, err := ParseKey(data)
		if err != nil || !got.Equal(key) {
			t.Errorf("%s: %v", name, err)
		}
	}
	for name, data := range map[string][]byte{"empty": nil, "not pem": []byte("hello"), "garbage": pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: []byte("nope")})} {
		if _, err := ParseKey(data); err == nil {
			t.Errorf("%s: want an error", name)
		}
	}
}
