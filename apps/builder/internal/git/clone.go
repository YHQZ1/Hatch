package git

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

func Clone(ctx context.Context, repoURL, token, branch, destDir string) error {
	repoPath := strings.TrimPrefix(repoURL, "https://")
	authedURL := fmt.Sprintf("https://%s@%s", token, repoPath)

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
	args = append(args, authedURL, destDir)

	cmd := exec.CommandContext(ctx, "git", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git clone failed: %s", string(out))
	}

	return nil
}
