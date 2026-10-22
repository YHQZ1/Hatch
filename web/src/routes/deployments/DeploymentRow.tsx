import { Link } from "react-router";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { safeHttpUrl } from "@/lib/url";
import ActionsMenu from "../overview/ActionsMenu";
import { BranchIcon, CommitIcon } from "../overview/Glyphs";
import ProjectIcon from "../overview/ProjectIcon";
import { RepoLink } from "../overview/RepoLink";
import type { useProjectActions } from "../overview/useProjectActions";
import { formatCommit, formatRelativeTime, formatRepoSlug, projectName } from "../services/service";
import type { FeedItem } from "../services/useDeploymentFeed";
import StatusLine from "./StatusLine";
import { ROW_HEIGHT, type StateInfo, canRollBack, durationSeconds } from "./deployments";

/**
 * One deployment as one line, the way a table of builds reads: the project, the
 * commit, how it ended and how long it took, whether it is what runs now, the
 * commit id and branch, and when. The whole row opens its logs; the menu sits
 * on top of that link. On a phone the same facts stack in three short lines.
 */
export default function DeploymentRow({
  item,
  info,
  iconVersion,
  projectLive,
  actions,
}: {
  item: FeedItem;
  info: StateInfo;
  /** Changes when the project is redeployed, so its icon is asked for again. */
  iconVersion: string;
  /** Whether the project is running now, so its icon can be fetched. */
  projectLive: boolean;
  actions: ReturnType<typeof useProjectActions>;
}) {
  const { deployment, project } = item;
  const [menuOpen, setMenuOpen] = useState(false);
  const commit = formatCommit(deployment);
  const name = projectName(project);
  const logs = `/projects/${project.id}/deployments/${deployment.id}`;
  const address = info.state === "current" ? safeHttpUrl(deployment.url) : null;
  const running = info.state === "building";
  const seconds = durationSeconds(deployment);
  const startedAt = new Date(deployment.created_at);
  const message = commit.message ?? "No commit message";
  const detail = info.state === "failed" ? [deployment.error_stage?.replaceAll("_", " "), deployment.error_message].filter(Boolean).join(": ") : "";
  const when = formatRelativeTime(deployment.created_at);

  const menu = (
    <ActionsMenu
      label={`Actions for the deployment of ${name}`}
      items={[
        { label: "View logs", href: logs },
        { label: "Open project", href: `/projects/${project.id}` },
        { label: "Visit", href: address ?? undefined, disabled: !address },
        ...(canRollBack(deployment, info)
          ? [{ label: "Roll back to this deployment", onSelect: () => void actions.rollback(project, deployment), group: 1 }]
          : []),
        ...(running
          ? [{ label: "Cancel deployment", onSelect: () => void actions.cancel(project, deployment), danger: true, group: 1 }]
          : []),
      ]}
      busy={actions.busy.has(project.id)}
      onOpenChange={setMenuOpen}
    />
  );

  const status = <StatusLine info={info} startedAt={startedAt} seconds={seconds} detail={detail} />;
  // Plain text, no pill: green for what is running now, quiet grey for the rest.
  const badge = info.badge && (
    <span className={cn("whitespace-nowrap text-[13px]", info.badge === "Current" ? "font-medium text-success" : "text-faint")}>
      {info.badge}
    </span>
  );

  return (
    <li className={cn("relative border-b border-line last:border-b-0", menuOpen && "z-30")}>
      <Link
        to={logs}
        aria-label={`Open the logs of ${name}: ${message}`}
        className="absolute inset-0 z-0 transition-colors hover:bg-ink/[0.03] focus-visible:outline-2 focus-visible:outline-accent"
      />

      {/* A wide screen: one line, every column aligned with the rows above and below. */}
      <div
        className={cn(
          ROW_HEIGHT,
          "pointer-events-none relative z-10 hidden items-center gap-x-5 px-5 lg:grid",
          "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_10rem_4.5rem_2rem]",
          "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_10rem_6rem_6.5rem_minmax(0,0.8fr)_4.5rem_2rem]",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <ProjectIcon projectId={project.id} version={iconVersion} running={projectLive} size={28} />
          <span className="truncate text-sm font-semibold">{name}</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm" title={message}>
            {message}
          </p>
          {/* Where the code lives. Why a build failed is on its status, on hover, and in its logs. */}
          <p className="mt-0.5 flex text-xs text-muted">
            <RepoLink url={project.repo_url} slug={formatRepoSlug(project.repo_url)} />
          </p>
        </div>
        {status}
        <div className="hidden xl:block">{badge}</div>
        <p className="hidden items-center gap-1.5 text-xs text-muted xl:flex">
          <CommitIcon className="h-4 w-4 shrink-0" />
          <span className="font-mono">{commit.short}</span>
        </p>
        <p className="hidden min-w-0 items-center gap-1.5 text-[13px] text-muted xl:flex">
          <BranchIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{deployment.branch}</span>
        </p>
        <p className="whitespace-nowrap text-right text-[13px] text-muted" title={startedAt.toLocaleString()}>
          {when}
        </p>
        {menu}
      </div>

      {/* A phone: the same facts in three short lines. */}
      <div className="pointer-events-none relative z-10 space-y-1.5 px-4 py-3.5 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <ProjectIcon projectId={project.id} version={iconVersion} running={projectLive} size={24} />
            <span className="truncate text-sm font-semibold">{name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {status}
            {menu}
          </div>
        </div>
        <p className="truncate text-sm">{message}</p>
        <p className="flex text-xs text-muted">
          <RepoLink url={project.repo_url} slug={formatRepoSlug(project.repo_url)} />
        </p>
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1">
            <CommitIcon className="h-3.5 w-3.5" />
            <span className="font-mono">{commit.short}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1">
            <BranchIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{deployment.branch}</span>
          </span>
          <span>· {when}</span>
          {badge}
        </p>
      </div>
    </li>
  );
}
