import { Link } from "react-router";
import { cn } from "@/lib/cn";
import type { Deployment, Project } from "@/lib/types";
import StatusLine from "../deployments/StatusLine";
import { type StateInfo, durationSeconds, stateOf } from "../deployments/deployments";
import { BranchIcon, CommitIcon } from "../overview/Glyphs";
import { formatCommit, formatRelativeTime } from "../services/service";

/**
 * Every deployment of the project, newest first. Choosing one shows its log
 * and details; "Details" opens its own page.
 */
export default function DeploymentList({
  project,
  deployments,
  current,
  activeId,
  onSelect,
}: {
  project: Project;
  deployments: Deployment[];
  current: Set<string>;
  activeId: string | null;
  onSelect: (deployment: Deployment) => void;
}) {
  return (
    <section aria-label="Deployments" className="min-w-0">
      <div className="mb-3 flex min-h-9 items-center gap-3">
        <h2 className="text-[1rem] font-semibold tracking-tight">Deployments</h2>
        <span className="text-sm text-muted">{deployments.length}</span>
      </div>

      {deployments.length === 0 ? (
        <p className="rounded-hatch border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
          Nothing has been deployed yet.
        </p>
      ) : (
        <ul className="max-h-[520px] overflow-y-auto rounded-hatch border border-line-strong bg-base">
          {deployments.map((deployment) => {
            const info: StateInfo = stateOf({ deployment, project }, current);
            const commit = formatCommit(deployment);
            const selected = deployment.id === activeId;
            return (
              <li
                key={deployment.id}
                className={cn(
                  "flex items-stretch border-b border-line last:border-b-0",
                  selected ? "bg-ink/[0.05]" : "hover:bg-ink/[0.03]",
                )}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(deployment)}
                  className="min-w-0 flex-1 cursor-pointer space-y-1 px-4 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="flex items-center gap-3">
                    <StatusLine
                      info={info}
                      startedAt={new Date(deployment.created_at)}
                      seconds={durationSeconds(deployment)}
                    />
                    {info.badge === "Current" && <span className="text-[13px] font-medium text-success">Current</span>}
                  </span>
                  <span className="block truncate text-sm" title={commit.message ?? undefined}>
                    {commit.message ?? "No commit message"}
                  </span>
                  <span className="flex min-w-0 items-center gap-x-3 text-xs text-muted">
                    <span className="flex shrink-0 items-center gap-1">
                      <CommitIcon className="h-3.5 w-3.5" />
                      <span className="font-mono">{commit.short}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1">
                      <BranchIcon className="h-3 w-3 shrink-0" />
                      <span className="truncate">{deployment.branch}</span>
                    </span>
                    <span className="ml-auto shrink-0">{formatRelativeTime(deployment.created_at)}</span>
                  </span>
                </button>
                <Link
                  to={`/projects/${project.id}/deployments/${deployment.id}`}
                  aria-label={`Details of the deployment ${deployment.id.slice(0, 8)}`}
                  className="flex items-center px-4 text-sm text-muted transition-colors hover:text-ink"
                >
                  Details
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
