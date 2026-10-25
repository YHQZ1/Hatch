# Setting up the GitHub App

Hatch signs users in, and reads their repositories, through a GitHub App
([ADR 0010](decisions/0010-github-app.md)). Every Hatch installation needs its
own App, because the App's callback URL, credentials, and private key belong to
one installation. This takes a few minutes.

Hatch is meant to be run as one hosted site that everyone signs into, with one
App owned by the operator. Running your own copy is possible, since it is the
same code, but self-hosting is not a supported path yet. The same steps are
needed for local development.

## Create the App

On GitHub: **Settings, Developer settings, GitHub Apps, New GitHub App**.

| Field | Value |
| --- | --- |
| GitHub App name | Any unique name, for example `Hatch (local dev)`. It becomes the App's slug. |
| Homepage URL | Any URL, for example this repository. |
| Callback URL | `http://localhost:8080/auth/callback`, or your server's address plus `/auth/callback`. |
| Expire user authorization tokens | Leave checked. |
| Request user authorization (OAuth) during installation | **Check this.** Installing the App then signs the user in too. |
| Enable Device Flow | Leave unchecked. |
| Webhook, Active | Optional, and only for "deploy on every push": see [Pushes and auto-deploy](#pushes-and-auto-deploy). It needs a public URL, so leave it unchecked for local development. |
| Repository permissions | **Contents: Read-only** and **Metadata: Read-only** (GitHub always requires metadata). |
| Account permissions | None. |
| Where can this GitHub App be installed? | Only on this account, unless others will use your Hatch. |

## Configure Hatch

After creating the App:

1. Copy the **slug**, the last part of `github.com/apps/<slug>`.
2. Copy the **Client ID**. It starts with `Iv`; an ID starting with `Ov` belongs
   to an OAuth App, which Hatch no longer uses.
3. Under **Client secrets**, generate a secret. GitHub shows it once.

4. Under **Private keys**, click **Generate a private key**. GitHub downloads a
   `.pem` file once and keeps no copy. Move it somewhere safe (the repository
   root works for development: `*.pem` is ignored by git and Docker).

Put them in `.env` (never commit that file):

```
GITHUB_APP_SLUG=your-github-app-slug
GITHUB_CLIENT_ID=Iv...
GITHUB_CLIENT_SECRET=...
GITHUB_REDIRECT_URI=http://localhost:8080/auth/callback
GITHUB_APP_PRIVATE_KEY_PATH=your-app.private-key.pem
```

`GITHUB_REDIRECT_URI` must match the App's callback URL exactly.
`GITHUB_APP_PRIVATE_KEY_PATH` is read from the directory Hatch runs in. Both
`hatch serve` and `hatch worker` need it and the Client ID, and refuse to start
if the key cannot be read. There is no need for the numeric App ID: GitHub
accepts the Client ID as the issuer of the App's JWT.

## How builds read your code

A build never receives your GitHub token. Hatch signs a short JWT with the
App's private key, asks GitHub which installation covers the repository, and
requests an installation token limited to that one repository with
`contents: read`. The token lasts an hour, is used for the `git clone`, and is
not stored. If the App is not installed on the repository, the build fails with
a message telling you to install it.

Creating a project and starting a deployment read the repository the same way
(branch, Dockerfile, latest commit), so they say so up front when the App is not
installed on it, instead of the build failing later. Whether a user may use a
repository at all is checked separately, with the user's own GitHub token: the
App's token can read every repository it is installed on, whoever installed it,
so it cannot say who may ask for one.

## Pushes and auto-deploy

A project with **Deploy on every push** on is deployed when its branch is
pushed to. Hatch learns of a push from the App's own webhook: GitHub sends one
delivery per event for every repository the App is installed on, to one URL,
signed with one secret ([ADR 0010](decisions/0010-github-app.md)). Hatch
registers no webhook per project and stores no per-project secret.

To turn it on, set these on the App (**Settings, Developer settings, GitHub
Apps, your App**):

| Field | Value |
| --- | --- |
| Webhook, Active | Checked. |
| Webhook URL | Your server's public address plus `/api/webhooks/github`, for example `https://hatch.example.com/api/webhooks/github`. GitHub has to be able to reach it. |
| Webhook secret | A random string of at least 16 characters, such as the output of `openssl rand -hex 32`. |
| Subscribe to events | **Push**. (It is offered because the App has the Contents permission.) |

and the same secret in `.env`:

```
GITHUB_WEBHOOK_SECRET=...
```

Without `GITHUB_WEBHOOK_SECRET` Hatch refuses every delivery (503), and the
settings page says that a push cannot deploy anything and does not let you turn
the setting on. Every delivery is checked against the secret before anything
else; an unsigned or wrongly signed one gets a 401 and does nothing. GitHub's
"Redeliver" button is safe: a delivery already handled is recognised and
ignored. One push deploys every project of that repository that follows the
pushed branch.

On a laptop GitHub cannot reach `localhost`. A relay such as
[smee.io](https://smee.io) forwards deliveries to
`http://localhost:8080/api/webhooks/github`; set the App's Webhook URL to the
relay's address. Run it with
`npx smee-client --url <your smee URL> --target http://localhost:8080/api/webhooks/github`.
The relay drops its connection now and then and does not replay what it missed,
so a delivery that never shows up in Hatch's request log can be sent again from
the App's **Advanced, Recent Deliveries**. A green tick there only means the
relay answered; the `make dev` log shows what Hatch answered.

**Older projects:** before this, Hatch registered a webhook on each
repository. Those no longer match anything and GitHub will report their
deliveries as failing. They can be deleted under the repository's
**Settings, Webhooks** (look for the one pointing at your Hatch server).

## How sign-in works

- `GET /auth/github` sends the browser to GitHub to authorize the App.
- `GET /auth/install` sends the browser to GitHub to install the App on chosen
  repositories; because of the setting above, GitHub then finishes at the same
  callback, so installing also signs the user in.
- `GET /auth/callback` checks the `state` value, exchanges the code, creates or
  updates the user, starts a session, and redirects to the web UI. When
  something goes wrong it redirects to `/auth?error=<code>` instead, where code
  is one of `state`, `denied`, `exchange`, `github`, or `server`.
- `POST /auth/logout` ends the session.

GitHub App user tokens expire after 8 hours. Hatch stores the token and its
refresh token (both encrypted) and renews them when a request needs GitHub, so
the user stays signed in to Hatch for the session's lifetime. If the refresh
token has expired (about six months) or GitHub rejects it, the user is sent back
to sign in. Keep **Expire user authorization tokens** checked, as above;
without it GitHub issues no refresh token.

`GET /api/github/repos` lists the repositories the user has granted to the App
through its installations. Until the App is installed the list is empty and the
web app links to `/auth/install`.

Sessions are stored in Postgres, and the cookie holds a random ID whose hash is
the only thing stored ([ADR 0013](decisions/0013-server-side-sessions.md)).
