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

## As built, sign-in (2026-10-21)

Sign-in and sessions are built. The user access token is still stored
(encrypted) because the repository, webhook, and build code written for the
OAuth App uses it; GitHub App user tokens expire after 8 hours, so refreshing
them arrives with the repositories slice, which also removes per-project
webhooks and the stored token. Installation tokens (App ID and private key) are
not used yet. Setup is in [07-github-app-setup.md](../07-github-app-setup.md).

## As built, repository access (2026-10-22)

- **Token refresh.** The user access token and its refresh token are stored
  encrypted with their expiry times (migration 000012). `auth.Tokens` renews a
  token that has expired, or will within two minutes, and saves the new pair.
  GitHub refresh tokens are single-use, so renewal runs in a transaction that
  locks the user's row; two requests cannot both spend the same refresh token.
  A token with no recorded expiry, from before this change, is used as it is.
- **On demand.** The session middleware no longer decrypts a token on every
  request. Handlers that talk to GitHub call `auth.GitHubToken`, so a GitHub
  outage does not break pages that never call it. When renewal is impossible
  (no refresh token, an expired one, or GitHub rejecting it) the request gets a
  401 and the web app signs the user out.
- **Listing.** `GET /api/github/repos` returns `{installed, installations,
  repos}`, built from `/user/installations` and each installation's
  repositories, so only repositories the user granted to the App appear. It is
  not cached, so repositories added in GitHub's settings show on the next load.
  When `installed` is false the web app links to `/auth/install`.
- **Installation tokens for builds.** `internal/githubapp` signs the App's
  JWT (RS256, nine minutes, issuer = the Client ID, which GitHub accepts in
  place of the App ID) and exchanges it for an installation token limited to
  one repository with `contents: read`. The builder uses it for `git clone`
  and never reads the user's token, so push-triggered builds work with nobody
  signed in and do not depend on the owner's refresh token. If the App is not
  installed on the repository the build fails with an instruction to install
  it. `GITHUB_APP_PRIVATE_KEY_PATH` is required by `hatch serve` and
  `hatch worker`.
- **Still to do:** the per-project webhooks and their stored secret still
  drive auto-deploy. They go once the App's own webhook (which needs a public
  URL, see the setup guide) delivers pushes. The user token stays stored, since
  it is how the repository list is read, but it is no longer used to deploy.
