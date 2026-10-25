-- A user's connection to their own AWS account (ADR 0001, 0020). Hatch stores
-- the role it assumes and what the hatch-connect stack reported, never AWS keys.
--
-- A connection starts pending with a fresh ExternalId and the principal it was
-- created for (so a later change of Hatch's own identity can be told apart from
-- a broken role). The user then creates the stack and gives Hatch the role ARN;
-- verification fills in the rest and moves it to connected or error.
CREATE TABLE cloud_connections (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider           TEXT NOT NULL DEFAULT 'aws' CHECK (provider = 'aws'),
    status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'error')),
    region             TEXT NOT NULL,
    stack_name         TEXT NOT NULL DEFAULT 'hatch-connect',
    external_id        TEXT NOT NULL UNIQUE,
    principal_arn      TEXT NOT NULL,
    monthly_budget_usd INTEGER NOT NULL CHECK (monthly_budget_usd >= 1),
    budget_email       TEXT NOT NULL,
    certificate_arn    TEXT,
    -- Filled in by the user, then checked.
    role_arn           TEXT,
    aws_account_id     TEXT,
    -- Filled in by verification.
    template_version   TEXT,
    serves_https       BOOLEAN,
    stack_outputs      JSONB,
    last_error         TEXT,
    last_verified_at   TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX cloud_connections_user_id_idx ON cloud_connections (user_id);
