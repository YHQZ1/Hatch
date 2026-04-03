CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id       BIGINT UNIQUE NOT NULL,
    github_username TEXT NOT NULL,
    access_token    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repo_name   TEXT NOT NULL,
    repo_url    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE deployments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    branch           TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'queued',
    cpu              INT NOT NULL,
    memory_mb        INT NOT NULL,
    port             INT NOT NULL,
    health_check     TEXT NOT NULL DEFAULT '/',
    image_uri        TEXT,
    ecs_task_arn     TEXT,
    subdomain        TEXT UNIQUE,
    url              TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deployed_at      TIMESTAMPTZ
);

CREATE TABLE env_vars (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    key           TEXT NOT NULL,
    secret_arn    TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_deployments_project_id ON deployments(project_id);
CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_env_vars_deployment_id ON env_vars(deployment_id);