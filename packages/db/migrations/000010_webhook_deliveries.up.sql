CREATE TABLE webhook_deliveries (
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    delivery_id TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, delivery_id)
);

CREATE INDEX idx_webhook_deliveries_created_at
ON webhook_deliveries(created_at);
