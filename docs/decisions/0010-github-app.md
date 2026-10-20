# 0010. A GitHub App for sign-in, repository access, and webhooks

- Status: Accepted
- Date: 2026-10-21

## Context

Hatch uses a GitHub OAuth App with the `repo` scope. That scope grants read
and write access to every repository the user can reach, public and private,
and the resulting token does not expire. Hatch stores it (encrypted) and uses
it to list repositories, clone, and register one webhook per project.

In Phase 3, CodeBuild in the user's AWS account must fetch source code, which
means handing it a credential. A long-lived token with access to everything is
the wrong thing to pass into another account.

## Decision

Replace the OAuth App with a single **GitHub App**:

- **Sign-in:** the App's user authorization flow identifies the user (GitHub
  ID and username). The user access token is used only to list the user's
  installations and is not needed to deploy.
- **Repository access:** users install the App on the repositories (or
  organizations) they choose. Hatch requests short-lived **installation
  tokens** (valid for one hour) when it needs to read a repository, and never
  stores them.
- **Permissions:** contents read-only and metadata read-only; nothing else
  until a feature needs it.
- **Webhooks:** delivered once to Hatch's App webhook URL for every installed
  repository; no per-project hook registration. Signatures are verified with
  the App's webhook secret, and delivery IDs are still deduplicated.
- **Builds (Phase 3):** CodeBuild receives an installation token scoped to the
  one repository being built (this settles Q11).

## Consequences

- Hatch can only see repositories the user explicitly granted, read-only.
- No long-lived GitHub credential is stored for repository access; a leaked
  database exposes no usable repository token.
- Each Hatch installation needs its own GitHub App (App ID, private key,
  client ID and secret, webhook secret). Self-hosters create one; setup docs
  must walk through it, ideally with a GitHub App manifest.
- Per-project webhook registration, the project `webhook_secret` and
  `webhook_id` columns, and the stored OAuth access token go away; existing
  users must sign in again and install the App.
- Webhooks need a public URL; in local development a forwarding service such
  as smee.io relays them to the local server.
