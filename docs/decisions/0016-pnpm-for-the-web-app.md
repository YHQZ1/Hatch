# 0016. pnpm for the web app

- Status: Accepted
- Date: 2026-10-21

## Context

The web app is rebuilt on Vite (ADR 0009), so its package manager can change
at no cost. The choice is npm, which needs nothing extra, or pnpm.

## Decision

Use **pnpm**, pinned in `web/package.json` (`packageManager`) to the 10.x line.

- Dependencies are resolved strictly: code can only import packages it
  declares, which catches missing dependencies npm would hide.
- Dependency install scripts are blocked unless listed in
  `web/pnpm-workspace.yaml` (`onlyBuiltDependencies`), and versions published
  in the last day are not installed (`minimumReleaseAge: 1440`), which limits
  exposure to compromised releases.
- Installs are faster and share one store.

Pinned to 10.x, not the latest, because **Dependabot supports pnpm 7 to 10**
(GitHub's supported-ecosystems documentation); a newer pnpm may produce
lockfiles Dependabot cannot update. Revisit when it lists 11 or later.

## Consequences

- Contributors need pnpm. It switches itself to the pinned version when run
  inside `web/`, so installing any recent pnpm is enough. Node 25 and later no
  longer ship corepack, so pnpm is installed separately there.
- CI uses `pnpm/action-setup` (reads the pinned version), and the Docker build
  uses `corepack enable` on the Node 24 image.
- The lockfile is `web/pnpm-lock.yaml`; npm and yarn lockfiles must not be
  added.
