//go:build unix

package docker

import (
	"os/exec"
	"syscall"
	"testing"
)

func TestOwnProcessGroupDetachesTheChildFromTheTerminalSignals(t *testing.T) {
	cmd := exec.Command("sleep", "30")
	ownProcessGroup(cmd)
	if err := cmd.Start(); err != nil {
		t.Fatalf("start: %v", err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	})

	pgid, err := syscall.Getpgid(cmd.Process.Pid)
	if err != nil {
		t.Fatalf("getpgid: %v", err)
	}
	if pgid != cmd.Process.Pid {
		t.Errorf("child's process group = %d, want its own (%d)", pgid, cmd.Process.Pid)
	}
	if pgid == syscall.Getpgrp() {
		t.Error("child is still in Hatch's process group, so Ctrl+C would reach it directly")
	}
}
