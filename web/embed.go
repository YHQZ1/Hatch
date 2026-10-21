// Package web embeds the built web UI so the hatch binary can serve it.
//
// The UI is built into web/dist by `pnpm build` (or `make web`). The directory
// always holds a .gitkeep placeholder, so `go build` works before the first
// web build; the server then answers that the UI is not built.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// Dist returns the built UI with dist/ as its root.
func Dist() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		// Only possible if "dist" is not a valid path, which it is.
		panic(err)
	}
	return sub
}
