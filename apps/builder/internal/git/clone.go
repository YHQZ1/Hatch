package git

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

func Clone(ctx context.Context, repoURL, token, destDir string) error {

	repoPath := strings.TrimPrefix(repoURL, "https://")
	authedURL := fmt.Sprintf("https://%s@%s", token, repoPath)

	_ = os.RemoveAll(destDir)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return fmt.Errorf("fs error: %w", err)
	}

	cmd := exec.CommandContext(ctx, "git", "clone", "--depth=1", authedURL, destDir)

	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git error: %s", string(out))
	}

	return nil
}
