import { useState } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/cn";
import { type ServiceRow, formatCommit, formatRelativeTime } from "../services/service";
import ActionsMenu from "./ActionsMenu";
import { Address } from "./Address";
import DeployTicks from "./DeployTicks";
import { BranchIcon, CommitIcon } from "./Glyphs";
import ProjectIcon from "./ProjectIcon";
import { RepoLink } from "./RepoLink";
import type { Tick } from "./history";
import { displayName, noteOf } from "./overview";
import { projectMenuItems } from "./projectMenu";
import type { useProjectActions } from "./useProjectActions";

const NOTE_TEXT = { danger: "text-danger", warning: "text-warning", muted: "text-muted" } as const;

/**
 * One project as a card: its icon and name, the address it is served at, the
 * repository it comes from, its latest commit, and how its recent deployments
 * went. The whole card opens the project; the address, the repository, the
 * deployment marks and the menu sit on top of that link, so the rest of the
 * content ignores pointer events. A project that is not live says so in a short
 * coloured note after the time; a live one says nothing.
 */
export default function ProjectCard({
  row,
  ticks,
  actions,
  onDelete,
}: {
  row: ServiceRow;
  ticks: Tick[];
  actions: ReturnType<typeof useProjectActions>;
  onDelete: (row: ServiceRow) => void;
}) {
  const { project, lastDeployment, status } = row;
  const [menuOpen, setMenuOpen] = useState(false);
  const commit = formatCommit(lastDeployment);
  const name = displayName(row);
  const note = noteOf(row);

  return (
    <article
      className={cn(
        "relative flex min-h-[200px] flex-col rounded-hatch border bg-base p-5 transition-colors hover:border-ink/40 hover:bg-ink/[0.02]",
        status.kind === "failed" ? "border-danger/40" : "border-line-strong",
        menuOpen && "z-30",
      )}
    >
      <Link
        to={`/projects/${project.id}`}
        aria-label={`Open ${name}`}
        className="absolute inset-0 z-0 rounded-hatch focus-visible:outline-2 focus-visible:outline-accent"
      />

      {/* z-20: the menu opens downward over the rows below, which are z-10. */}
      <div className="pointer-events-none relative z-20 flex items-start gap-3">
        <ProjectIcon projectId={project.id} version={lastDeployment?.id} running={status.kind === "live"} size={44} />
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="truncate text-[15px] font-semibold leading-5">{name}</h3>
          <Address row={row} />
        </div>
        <ActionsMenu
          label={`Actions for ${name}`}
          items={projectMenuItems(row, actions, onDelete)}
          busy={actions.busy.has(project.id)}
          onOpenChange={setMenuOpen}
        />
      </div>

      <p className="pointer-events-none relative z-10 mt-3 flex max-w-full text-[13px] leading-5 text-muted">
        <RepoLink url={project.repo_url} slug={row.repoSlug} className="max-w-full" />
      </p>

      <div className="pointer-events-none relative z-10 mt-auto pt-4">
        {lastDeployment ? (
          <p className="flex min-w-0 items-center gap-2 text-[13px] leading-5">
            <CommitIcon className="h-4 w-4 shrink-0 text-muted" />
            <span className="truncate">{commit.message ?? `Deployment ${commit.short}`}</span>
          </p>
        ) : (
          <p className="text-[13px] leading-5 text-muted">No deployments yet</p>
        )}
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <span className="shrink-0">{formatRelativeTime(row.updatedAtRaw)}</span>
            <BranchIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{lastDeployment?.branch ?? project.branch}</span>
            {note && <span className={cn("shrink-0", NOTE_TEXT[note.tone])}>· {note.text}</span>}
          </p>
          <DeployTicks projectId={project.id} ticks={ticks} slots={12} />
        </div>
      </div>
    </article>
  );
}
