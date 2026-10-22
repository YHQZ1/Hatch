import { Link } from "react-router";
import { StatusBadge } from "../services/ServiceTable";
import { type ServiceRow, formatCommit, formatRelativeTime } from "../services/service";

/**
 * One service as a card. The whole card opens the service; the live URL is its
 * own link on top, so the content ignores pointer events except for that.
 */
export default function ServiceCard({ row }: { row: ServiceRow }) {
  const { project, lastDeployment, status, liveUrl, repoSlug } = row;
  const branch = lastDeployment?.branch ?? project.branch;
  const commit = formatCommit(lastDeployment);

  return (
    <article className="relative flex flex-col rounded-hatch border border-line-strong bg-base p-5 transition-colors hover:border-ink/40">
      <Link
        to={`/projects/${project.id}`}
        aria-label={`Open ${project.repo_name}`}
        className="absolute inset-0 z-0 rounded-hatch focus-visible:outline-2 focus-visible:outline-accent"
      />

      <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[1rem] font-semibold tracking-tight">
            {project.repo_name}
          </h3>
          {liveUrl ? (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto mt-0.5 block truncate font-mono text-xs text-muted transition-colors hover:text-accent"
            >
              {liveUrl.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            <p className="mt-0.5 truncate font-mono text-xs text-faint">
              {project.subdomain || "Not deployed yet"}
            </p>
          )}
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="pointer-events-none relative z-10 mt-5 space-y-1.5 border-t border-line pt-4">
        <p className="truncate font-mono text-xs text-muted">
          {repoSlug} <span className="text-faint">·</span> {branch}
        </p>
        <p className="truncate text-sm text-muted">
          {commit.message ?? (commit.short === "—" ? "No deployments yet" : commit.short)}
        </p>
      </div>

      <div className="pointer-events-none relative z-10 mt-4 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
        <span>{formatRelativeTime(row.updatedAtRaw)}</span>
        <span>{project.auto_deploy ? "Auto-deploy" : "Manual"}</span>
      </div>
    </article>
  );
}
