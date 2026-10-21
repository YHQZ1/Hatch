# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities in public GitHub issues.**

Email **rupareluttkarsh2309@gmail.com** with:

- a description of the vulnerability and its impact
- steps to reproduce or a proof of concept
- the affected component (api, builder, deployer, web, or a shared package)
- any suggested fix

You will get an acknowledgment within **48 hours** and a fuller response within
**7 days** with next steps, and updates as the issue is investigated and fixed.

We will not take legal action against researchers who follow this policy and
act in good faith.

## Supported versions

Hatch is a pre-release prototype that is being rebuilt; it is not ready for
production use. Security fixes go to the latest `main` only.

## Scope

In scope:

- Authentication, sessions, and CSRF protection (`internal/api/auth/`)
- Storage and use of GitHub OAuth tokens
- GitHub webhook signature verification
  (`internal/api/handlers/webhook.go`)
- Encryption of stored secrets (`internal/secrets/`)
- Access to another user's projects, deployments, or logs
- Handling of repositories and Dockerfiles during builds

Out of scope:

- Problems already listed in
  [Known problems](docs/02-current-state.md#known-problems); the rebuild
  addresses them
- Weaknesses in your own AWS account or infrastructure
- Denial of service
- Vulnerabilities in third-party dependencies (report those upstream)
- Automated scanner output without a working proof of concept

## If you run the prototype

- **Builds are not isolated.** The builder runs `docker build` on user
  Dockerfiles on its own host, with access to the Docker daemon and the host's
  AWS credentials. Run it only on an isolated host, for repositories you trust.
- **Env vars are visible in ECS.** They are encrypted in Postgres but written
  in plain text into ECS task definitions, so anyone with ECS read access in
  the account can see them.
- **Use strong secrets.** Generate `JWT_SECRET` and `DATA_ENCRYPTION_KEY` with
  `openssl rand -hex 32`. `DATA_ENCRYPTION_KEY` must be identical in the api,
  builder, and deployer, and changing it makes stored tokens and env vars
  unreadable.
- **Keep the backing services private.** Postgres, Redis, and RabbitMQ must not
  be reachable from the internet, and the default credentials in
  `docker-compose.yaml` are for local development only.
- **Limit AWS permissions.** Give the builder and deployer only the ECR, ECS,
  ELB, and CloudWatch permissions they use.
