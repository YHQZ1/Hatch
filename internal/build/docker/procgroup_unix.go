//go:build unix

package docker

import (
	"os/exec"
	"syscall"
)

// ownProcessGroup starts cmd in a process group of its own. A terminal sends
// Ctrl+C to every process of the foreground group, so a docker child left in
// Hatch's group dies of the signal itself (exit status 130) before Hatch knows
// it is stopping, and the build is recorded as failed instead of being run
// again on the next start. In a group of its own the child only hears from
// Hatch, which kills it when the job's context ends.
func ownProcessGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}
