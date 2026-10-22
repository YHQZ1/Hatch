import { useState } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/cn";
import { type ServiceRow, formatCommit, formatRelativeTime } from "../services/service";
import { Address } from "./Address";
import ActionsMenu from "./ActionsMenu";
import { CommitIcon } from "./Glyphs";
import ProjectIcon from "./ProjectIcon";
import { RepoLink } from "./RepoLink";
import { ROW_HEIGHT, displayName, noteOf } from "./overview";
import { projectMenuItems } from "./projectMenu";
import type { useProjectActions } from "./useProjectActions";

const NOTE_TEXT = { danger: "text-danger", warning: "text-warning", muted: "text-muted" } as const;

/**
 * One project as a line of the list: its icon, name and address; the latest
 * commit over the repository and when it happened; and the menu. The row opens
 * the project; the address and the menu sit on top of it. There is no status
 * badge: a project that is not live says so in a short coloured note after the
 * date, and one that is live says nothing.
 */
export default function ProjectRow({
  row,
  actions,
  onDelete,
}: {
  row: ServiceRow;
  actions: ReturnType<typeof useProjectActions>;
  onDelete: (row: ServiceRow) => void;
}) {
  const { project, lastDeployment, status } = row;
  const [menuOpen, setMenuOpen] = useState(false);
  const commit = formatCommit(lastDeployment);
  const name = displayName(row);
  const note = noteOf(row);

  return (
    <li
      className={cn(
        "relative border-b border-line last:border-b-0",
        status.kind === "failed" && "bg-danger/5",
        menuOpen && "z-30",
      )}
    >
      <Link
        to={`/projects/${project.id}`}
        aria-label={`Open ${name}`}
        className="absolute inset-0 z-0 transition-colors hover:bg-ink/[0.03] focus-visible:outline-2 focus-visible:outline-accent"
      />
      <div
        className={cn(
          ROW_HEIGHT,
          "pointer-events-none relative z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 px-5 py-4",
          "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_2rem]",
        )}
      >
        <div className="flex min-w-0 items-center gap-4">
          <ProjectIcon projectId={project.id} version={lastDeployment?.id} running={status.kind === "live"} size={40} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-5">{name}</p>
            <Address row={row} />
          </div>
        </div>

        <div className="order-3 col-span-2 min-w-0 lg:order-none lg:col-span-1">
          {lastDeployment ? (
            <>
              <p className="flex min-w-0 items-center gap-2 text-[15px] leading-5">
                <CommitIcon className="h-4 w-4 shrink-0 text-muted" />
                <span className="truncate">{commit.message ?? `Deployment ${commit.short}`}</span>
              </p>
              <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-muted">
                <RepoLink url={project.repo_url} slug={row.repoSlug} />
                <span className="shrink-0">· {formatRelativeTime(row.updatedAtRaw)}</span>
                {note && <span className={cn("shrink-0", NOTE_TEXT[note.tone])}>· {note.text}</span>}
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] leading-5 text-muted">No deployments yet</p>
              <p className="mt-1 flex min-w-0 items-center text-[13px] leading-5 text-muted">
                <RepoLink url={project.repo_url} slug={row.repoSlug} />
              </p>
            </>
          )}
        </div>

        <ActionsMenu
          label={`Actions for ${name}`}
          items={projectMenuItems(row, actions, onDelete)}
          busy={actions.busy.has(project.id)}
          onOpenChange={setMenuOpen}
        />
      </div>
    </li>
  );
}
