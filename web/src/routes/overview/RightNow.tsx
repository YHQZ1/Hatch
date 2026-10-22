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
    <li className="border-b border-line px-4 py-4 last:border-b-0">
      <div className="flex items-center gap-3">
        <ProjectIcon projectId={project.id} version={deployment.id} running={false} size={32} />
        <div className="min-w-0 flex-1">
          <Link to={`/projects/${project.id}`} className="block truncate text-sm font-semibold leading-5 transition-colors hover:text-accent">
            {displayName(row)}
          </Link>
          <p className="truncate text-[13px] leading-5 text-muted">{commit.message ?? deployment.branch}</p>
        </div>
        <span className="shrink-0 text-[13px] tabular-nums text-muted" aria-label="Elapsed time">
          {Number.isNaN(started) ? "—" : formatElapsed(now - started)}
        </span>
      </div>

      {/* Where it is: each stage is a third of the width, its name over a thin line.
          Finished stages are ticked and solid, the running one has a highlight sweeping
          along it, and the rest are faint. */}
      <ol aria-label="Progress" className="mt-3.5 grid grid-cols-3 gap-3">
        {DEPLOY_STEPS.map((label, i) => {
          const done = i < current;
          const running = i === current;
          return (
            <li key={label} aria-current={running ? "step" : undefined} className="min-w-0">
              <p
                className={cn(
                  "flex items-center gap-1 truncate text-xs",
                  done && "text-muted",
                  running && "font-medium text-warning",
                  !done && !running && "text-faint",
                )}
              >
                {done && (
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden className="h-3 w-3 shrink-0 text-success">
                    <path d="M2.5 6.4l2.2 2.2 4.8-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                <span className="truncate">{label}</span>
              </p>
              <div
                aria-hidden
                className={cn(
                  "relative mt-1.5 h-0.5 overflow-hidden rounded-full",
                  done ? "bg-success" : running ? "bg-warning/25" : "bg-line-strong",
                )}
              >
                {running && <span className="absolute inset-y-0 w-1/2 animate-loading-bar rounded-full bg-warning motion-reduce:animate-none" />}
              </div>
            </li>
          );
        })}
      </ol>

      {/* The newest line of the build, as a quote: no box of its own. */}
      <p className="mt-3 line-clamp-2 break-words border-l-2 border-line pl-3 font-mono text-xs leading-5 text-muted">
        {lastLog.data ?? "Waiting for the first log line…"}
      </p>

      <div className="mt-3 -mb-1 flex items-center justify-between">
        <Link
          to={`/projects/${project.id}/deployments/${deployment.id}`}
          className="-ml-2 inline-flex h-7 items-center rounded-hatch px-2 text-[13px] text-muted transition-colors hover:bg-ink/5 hover:text-ink"
        >
          View logs
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => void actions.cancel(project, deployment)}
          className="-mr-2 inline-flex h-7 items-center rounded-hatch px-2 text-[13px] text-danger transition-colors hover:bg-danger/10 disabled:cursor-wait disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </li>
  );
}
