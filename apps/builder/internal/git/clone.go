package git

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

func Clone(ctx context.Context, repoURL, token, branch, destDir string) error {
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
		cleaned = strings.ReplaceAll(cleaned, token, "[redacted]")
	}
	return strings.TrimSpace(cleaned)
}
