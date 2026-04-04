package git

import (
	"context"
	"fmt"
	"os"
	"os/exec"
)

func Clone(ctx context.Context, repoURL, token, destDir string) error {
	authedURL := fmt.Sprintf("https://%s@%s", token, repoURL[8:])

	if err := os.MkdirAll(destDir, 0755); err != nil {
		return fmt.Errorf("failed to create dest dir: %w", err)
	}

	cmd := exec.CommandContext(ctx, "git", "clone", "--depth=1", authedURL, destDir)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git clone failed: %s", string(out))
	}

	return nil
}
