package git

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"strings"
)

var githubPathPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?$`)

func Clone(ctx context.Context, repoURL, token, branch, destDir string) error {
	if err := validateCloneInput(repoURL, branch); err != nil {
		return err
	}
	if err := os.RemoveAll(destDir); err != nil {
		return fmt.Errorf("failed to clean destination directory: %w", err)
	}

	if err := os.MkdirAll(destDir, 0755); err != nil {
		return fmt.Errorf("failed to create destination directory: %w", err)
	}

	args := []string{"clone", "--depth=1"}
	if branch != "" {
		args = append(args, "--branch", branch)
	}
	args = append(args, repoURL, destDir)

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Env = append(os.Environ(),
		"GIT_CONFIG_COUNT=1",
		"GIT_CONFIG_KEY_0=http.https://github.com/.extraheader",
		"GIT_CONFIG_VALUE_0="+githubAuthHeader(token),
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git clone failed: %s", sanitizeCloneOutput(string(out), token))
	}

	return nil
}

func githubAuthHeader(token string) string {
	credentials := "x-access-token:" + strings.TrimSpace(token)
	return "AUTHORIZATION: basic " + base64.StdEncoding.EncodeToString([]byte(credentials))
}

func sanitizeCloneOutput(output, token string) string {
	cleaned := output
	if token != "" {
		trimmed := strings.TrimSpace(token)
		cleaned = strings.ReplaceAll(cleaned, token, "[redacted]")
		cleaned = strings.ReplaceAll(cleaned, trimmed, "[redacted]")
		cleaned = strings.ReplaceAll(cleaned, githubAuthHeader(trimmed), "[redacted]")
	}
	return strings.TrimSpace(cleaned)
}

func validateCloneInput(repoURL, branch string) error {
	if !isGitHubRepoURL(repoURL) {
		return fmt.Errorf("repo_url must be a GitHub HTTPS repository URL")
	}
	if strings.Contains(branch, "\x00") {
		return fmt.Errorf("branch contains invalid characters")
	}
	if len(branch) > 255 {
		return fmt.Errorf("branch is too long")
	}
	return nil
}

func isGitHubRepoURL(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return false
	}
	if parsed.Scheme != "https" || strings.ToLower(parsed.Hostname()) != "github.com" {
		return false
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return false
	}
	path := strings.Trim(parsed.EscapedPath(), "/")
	if strings.Contains(path, "%2f") || strings.Contains(path, "%2F") {
		return false
	}
	return githubPathPattern.MatchString(path)
}
