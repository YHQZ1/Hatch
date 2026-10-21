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
| Webhook, Active | Uncheck for now. Webhooks are needed only for auto-deploy, and need a public URL. |
| Repository permissions | **Contents: Read-only** and **Metadata: Read-only** (GitHub always requires metadata). |
| Account permissions | None. |
| Where can this GitHub App be installed? | Only on this account, unless others will use your Hatch. |

## Configure Hatch

After creating the App:

1. Copy the **slug**, the last part of `github.com/apps/<slug>`.
2. Copy the **Client ID**. It starts with `Iv`; an ID starting with `Ov` belongs
   to an OAuth App, which Hatch no longer uses.
3. Under **Client secrets**, generate a secret. GitHub shows it once.

Put them in `.env` (never commit that file):

```
GITHUB_APP_SLUG=your-github-app-slug
GITHUB_CLIENT_ID=Iv...
GITHUB_CLIENT_SECRET=...
GITHUB_REDIRECT_URI=http://localhost:8080/auth/callback
```

`GITHUB_REDIRECT_URI` must match the App's callback URL exactly.

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

Sessions are stored in Postgres, and the cookie holds a random ID whose hash is
the only thing stored ([ADR 0013](decisions/0013-server-side-sessions.md)).
