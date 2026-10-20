# 0009. Web UI: a React single-page app served by the Go binary

- Status: Accepted
- Date: 2026-10-21

## Context

The web UI is a Next.js 16 app run as its own Node server
(`output: "standalone"`). It uses no server-side Next.js features: no route
handlers, middleware, server actions, or `next/headers`. 28 of its 41
components are client components, and all data comes from the Go API. Next.js
is used only for routing (`next/link` and `next/navigation` in 21 files, three
layouts) and one Google font.

Running Next.js only to serve a client-side app costs a second runtime (Node)
in every install, a second container, cross-origin API calls with CORS, and a
heavier toolchain. Next.js's static export can drop the server, but it handles
dynamic routes like `/projects/[id]` poorly without knowing every ID at build
time.

The goal from 0002 is that an install is one Hatch program plus Postgres.

## Decision

- The backend stays Go. The frontend becomes a **React single-page app built
  with Vite**, in TypeScript, with **React Router** for routing and
  **TanStack Query** for API data. Tailwind CSS 4 and the existing components
  stay.
- `vite build` writes static files to `web/dist`. A small Go package in
  `web/` (`web/embed.go`, `//go:embed all:dist`) embeds them, and
  `hatch serve` serves them: API under `/api`, everything else falls back to
  `index.html`. The UI and API share one origin.
- In development, the Vite dev server proxies `/api` to the Go server, so hot
  reload keeps working.
- The migration happens in Phase 1, right after the repository move and before
  the auth and log-streaming changes, so new UI work is written once.

## Consequences

- An install is one binary (or one container) plus Postgres; no Node at
  runtime.
- Same origin: no CORS configuration in production, and session cookies can
  be `SameSite=Lax` or stricter.
- Faster builds and a smaller toolchain than Next.js.
- No server-side rendering. The dashboard sits behind a login, so search
  indexing does not matter; the landing page loses SSR, which is acceptable
  for now.
- `go build` needs `web/dist` to exist. The Makefile and Dockerfile build the
  web app first; a placeholder `index.html` keeps `go build` and `go test`
  working without a web build.
- The migration replaces the routing layer in 21 files and the three layouts;
  components otherwise carry over unchanged.
