-- A deployment's log lines, in the order they were written. `seq` counts from 1
-- within the deployment and is what a browser resumes from (Last-Event-ID).
-- `deployments.log_seq` is how many lines it has had, which numbers the next
-- one: updating that row serialises writers of the same deployment, so lines
-- are numbered and committed in order even when two writers race.
ALTER TABLE deployments
ADD COLUMN IF NOT EXISTS log_seq BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS deployment_logs (
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    seq           BIGINT NOT NULL,
    line          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (deployment_id, seq)
);

-- A wake-up for whoever is watching a deployment: just its id, sent when a log
-- line is added or its status changes. The data stays in the tables; NOTIFY
-- payloads are small and not kept, so a watcher reads what it missed from
-- them. A NOTIFY is delivered only when the transaction commits.
CREATE OR REPLACE FUNCTION notify_deployment_event() RETURNS trigger AS $$
BEGIN
    IF TG_TABLE_NAME = 'deployment_logs' THEN
        PERFORM pg_notify('deployment_events', NEW.deployment_id::text);
    ELSE
        PERFORM pg_notify('deployment_events', NEW.id::text);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deployment_logs_notify ON deployment_logs;
CREATE TRIGGER deployment_logs_notify
    AFTER INSERT ON deployment_logs
    FOR EACH ROW EXECUTE FUNCTION notify_deployment_event();

DROP TRIGGER IF EXISTS deployments_status_notify ON deployments;
CREATE TRIGGER deployments_status_notify
    AFTER UPDATE OF status ON deployments
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION notify_deployment_event();
