package main

import (
	"fmt"
	"runtime"
	"runtime/debug"
)

// version is set at build time:
//
//	go build -ldflags "-X main.version=v1.2.3" ./cmd/hatch
var version = "dev"

// versionString returns the version, the commit when the Go toolchain
// recorded one, and the Go version.
func versionString() string {
	commit := ""
	if info, ok := debug.ReadBuildInfo(); ok {
		var revision string
		var modified bool
		for _, s := range info.Settings {
			switch s.Key {
			case "vcs.revision":
				revision = s.Value
			case "vcs.modified":
				modified = s.Value == "true"
			}
		}
		if len(revision) > 12 {
			revision = revision[:12]
		}
		if revision != "" {
			commit = " (" + revision
			if modified {
				commit += ", modified"
			}
			commit += ")"
		}
	}
	return fmt.Sprintf("hatch %s%s %s", version, commit, runtime.Version())
}
