# 0014. Builds require a Dockerfile

- Status: Accepted
- Date: 2026-10-21

## Context

Managed platforms such as Render and Railway can build an app without a
Dockerfile by detecting its language and producing an image (Cloud Native
Buildpacks, Railway's Railpack). Hatch builds only from a Dockerfile.

A Dockerfile already supports every language and runtime that runs in a
container. What Dockerfile-less builds add is convenience, at the cost of
owning language detection, version selection, build caching, and many edge
cases: a separate product that open-source tools already provide.

## Decision

v1 builds only from a Dockerfile in the repository (path configurable per
project). Dockerfile-less builds are out of scope for v1.

## Consequences

- One build path to make reliable, secure, and fast on both the local target
  and CodeBuild.
- Repositories without a Dockerfile cannot be deployed until one is added.
  The UI should say so clearly when a repository has none.
- Adding Dockerfile-less builds later is a new `Builder` implementation
  (ADR 0004) that wraps an existing tool such as Railpack or Cloud Native
  Buildpacks, not a change to the deploy flow.
