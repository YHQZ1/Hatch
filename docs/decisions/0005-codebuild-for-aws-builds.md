# 0005. AWS builds run in CodeBuild in the user's account

- Status: Accepted
- Date: 2026-10-20

## Context

Today the builder runs `docker build` on the control-plane EC2 host, which also
holds broad AWS permissions. A malicious Dockerfile could attack the host.
Alternatives considered: per-build Fargate tasks running rootless BuildKit or
Kaniko, a hardened Docker host, or AWS CodeBuild.

## Decision

On the AWS provider, builds run in an AWS CodeBuild project created by the
`hatch-connect` stack in the user's account. Hatch starts each build with
source and image-tag overrides, streams its logs, and receives an image in the
user's ECR repository.

## Consequences

- Each build runs in a fresh, isolated environment managed by AWS, in the
  user's account and on their bill. Hatch never executes user code.
- Much less code than orchestrating build containers ourselves.
- CodeBuild needs privileged mode to build Docker images; this is acceptable
  because it is isolated per build and inside the user's account.
- Source access must use short-lived credentials (see Q11).
- Build start-up is slower than a warm local Docker daemon.
- Ties the AWS provider to CodeBuild; other providers will need their own
  builders.
