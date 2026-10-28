# 0004. Pluggable build and runtime providers, local Docker first

- Status: Accepted
- Date: 2026-10-20

## Context

There is no AWS access for development or testing. AWS-specific code is
currently called directly from the workers, so nothing can be exercised
without an account.

## Decision

Define separate `Builder`, `Runtime`, and `CostEstimator` interfaces.
Implement:

- `fake`: in-memory, scripted outcomes, for unit tests;
- `local`: Docker on the Hatch host, with a reverse proxy for
  `<app>.localhost`;
- `aws`: CodeBuild, ECR, ECS Fargate, ALB, and Secrets Manager through the
  assumed role.

Build the local provider first and use it as the real end-to-end path. Run one
shared behavioural test suite against every provider.

## Consequences

- The whole product flow can be developed and demonstrated without cloud
  spending.
- The local provider is also a usable product for single-server self-hosting.
- Interfaces must be designed around what both Docker and AWS can do; some AWS
  features (for example, health checks through the ALB) need local
  equivalents or graceful absence.
- Real AWS behaviour (IAM, throttling, eventual consistency) is only verified
  in Phase 6, so fakes must model the important failure modes. _Superseded in
  part by [0023](0023-real-aws-testing-starts-before-phase-6.md): an AWS account
  is available, and capped real-AWS testing starts earlier._
