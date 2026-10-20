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
	header := githubAuthHeader("gho_secret")
	got := sanitizeCloneOutput("fatal: token gho_secret rejected "+header, "gho_secret")
	if strings.Contains(got, "gho_secret") {
		t.Fatalf("sanitizeCloneOutput() leaked token: %q", got)
	}
	if strings.Contains(got, header) {
		t.Fatalf("sanitizeCloneOutput() leaked auth header: %q", got)
	}
	if !strings.Contains(got, "[redacted]") {
		t.Fatalf("sanitizeCloneOutput() = %q, want redaction marker", got)
	}
}

func TestIsGitHubRepoURL(t *testing.T) {
	valid := []string{
		"https://github.com/octocat/hello-world",
		"https://github.com/octocat/hello-world.git",
	}
	for _, repoURL := range valid {
		if !isGitHubRepoURL(repoURL) {
			t.Fatalf("isGitHubRepoURL(%q) = false, want true", repoURL)
		}
	}

	invalid := []string{
		"http://github.com/octocat/hello-world",
		"https://evil.com/octocat/hello-world",
		"git@github.com:octocat/hello-world.git",
		"https://github.com/octocat/hello-world/tree/main",
		"https://github.com/octocat/hello-world?token=secret",
		"https://github.com/octocat%2Fhello-world",
	}
	for _, repoURL := range invalid {
		if isGitHubRepoURL(repoURL) {
			t.Fatalf("isGitHubRepoURL(%q) = true, want false", repoURL)
		}
	}
}

func TestValidateCloneInputRejectsBadBranch(t *testing.T) {
	err := validateCloneInput("https://github.com/octocat/hello-world", strings.Repeat("a", 256))
	if err == nil {
		t.Fatal("validateCloneInput() succeeded for overlong branch")
	}
}
