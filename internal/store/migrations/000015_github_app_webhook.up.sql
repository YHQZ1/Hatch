-- Pushes now arrive through the GitHub App's own webhook (ADR 0010), verified
-- with one secret the operator sets, so a project no longer has a webhook of
-- its own to register, sign or remove. `auto_deploy` stays: it now means "deploy
-- when the App's webhook reports a push to the project's branch".
ALTER TABLE projects DROP COLUMN IF EXISTS webhook_secret;
ALTER TABLE projects DROP COLUMN IF EXISTS github_webhook_id;
