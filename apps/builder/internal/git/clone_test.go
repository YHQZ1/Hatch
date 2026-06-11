package git

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestGitHubAuthHeaderUsesBasicTokenCredentials(t *testing.T) {
	token := "gho_test_token"
	got := githubAuthHeader(" " + token + " ")
	wantSuffix := base64.StdEncoding.EncodeToString([]byte("x-access-token:" + token))

	if got != "AUTHORIZATION: basic "+wantSuffix {
		t.Fatalf("githubAuthHeader() = %q, want basic auth header", got)
	}
	if strings.Contains(got, token) {
		t.Fatal("githubAuthHeader() leaked raw token")
	}
}

func TestSanitizeCloneOutputRedactsToken(t *testing.T) {
	got := sanitizeCloneOutput("fatal: token gho_secret rejected", "gho_secret")
	if strings.Contains(got, "gho_secret") {
		t.Fatalf("sanitizeCloneOutput() leaked token: %q", got)
	}
	if !strings.Contains(got, "[redacted]") {
		t.Fatalf("sanitizeCloneOutput() = %q, want redaction marker", got)
	}
}
