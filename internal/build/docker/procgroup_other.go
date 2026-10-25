//go:build !unix

package docker

import "os/exec"

// ownProcessGroup is a no-op where process groups do not exist.
func ownProcessGroup(*exec.Cmd) {}
