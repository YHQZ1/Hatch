import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Panel } from "@/components/ui";
import { cn } from "@/lib/cn";
import { deploymentLastLogQuery } from "@/lib/queries";
import { useNow } from "@/lib/useNow";
import { type ServiceRow, formatCommit } from "../services/service";
import ProjectIcon from "./ProjectIcon";
import { DEPLOY_STEPS, displayName, formatElapsed, stepIndex } from "./overview";
import type { useProjectActions } from "./useProjectActions";

/**
 * Everything that is building or rolling out right now: the stage it is at, how
 * long it has been going, its newest log line, and a way to stop it. It is not
 * shown when nothing is in progress.
 */
export default function RightNow({
  rows,
  actions,
  className,
}: {
  rows: ServiceRow[];
  actions: ReturnType<typeof useProjectActions>;
  className?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <Panel className={className}>
      <div className="flex h-12 items-center justify-between border-b border-line px-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
          Right now
        </h2>
        <p className="text-[13px] text-muted">{rows.length} in progress</p>
      </div>
      <ul>
        {rows.map((row) => (
          <InProgress key={row.lastDeployment!.id} row={row} actions={actions} />
        ))}
      </ul>
    </Panel>
  );
}

function InProgress({ row, actions }: { row: ServiceRow; actions: ReturnType<typeof useProjectActions> }) {
  const { project } = row;
  const deployment = row.lastDeployment!;
  const now = useNow();
  const lastLog = useQuery(deploymentLastLogQuery(deployment.id));
  const current = stepIndex(deployment.status);
  const commit = formatCommit(deployment);
  const started = new Date(deployment.created_at).getTime();
  const busy = actions.busy.has(project.id);

  return (
    <li className="border-b border-line p-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <ProjectIcon projectId={project.id} version={deployment.id} running={false} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <Link to={`/projects/${project.id}`} className="truncate text-sm font-semibold transition-colors hover:text-accent">
              {displayName(row)}
            </Link>
            <span className="shrink-0 text-xs tabular-nums text-muted" aria-label="Elapsed time">
              {Number.isNaN(started) ? "—" : formatElapsed(now - started)}
            </span>
          </div>
          <p className="truncate text-[13px] text-muted">{commit.message ?? deployment.branch}</p>
        </div>
      </div>

      <div className="mt-3" role="group" aria-label="Progress">
        <div className="flex gap-1">
          {DEPLOY_STEPS.map((label, i) => (
            <span
              key={label}
              className={cn(
                "h-1 flex-1 rounded-full",
                i < current && "bg-success",
                i === current && "animate-pulse bg-warning",
                i > current && "bg-line-strong",
              )}
            />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted" aria-live="polite">
          {DEPLOY_STEPS[current] ?? "In progress"} · step {Math.max(current, 0) + 1} of {DEPLOY_STEPS.length}
        </p>
      </div>

      <p className="mt-3 truncate rounded-hatch bg-line/50 px-2.5 py-1.5 font-mono text-xs text-muted">
        {lastLog.data ?? "Waiting for the first log line…"}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <Link
          to={`/projects/${project.id}/deployments/${deployment.id}`}
          className="inline-flex h-8 items-center rounded-hatch border border-line-strong px-3 text-[13px] text-muted transition-colors hover:border-ink/40 hover:text-ink"
        >
          Logs
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => void actions.cancel(project, deployment)}
          className="inline-flex h-8 items-center rounded-hatch border border-danger/40 bg-danger/10 px-3 text-[13px] text-danger transition-colors hover:bg-danger/15 disabled:cursor-wait disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </li>
  );
}
