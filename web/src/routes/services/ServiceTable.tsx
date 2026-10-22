import { useState } from "react";
import { Link } from "react-router";
import { siGithub } from "simple-icons";
import BrandIcon from "@/components/BrandIcon";
import type { NoticePayload } from "@/components/NoticeToast";
import { Button, EmptyStateBlock, StatusText } from "@/components/ui";
import { apiFetch, readApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Deployment, Project } from "@/lib/types";
import { safeHttpUrl } from "@/lib/url";
import DeleteServiceModal from "./DeleteServiceModal";
import {
  type ServiceRow,
  type StatusKind,
  type StatusMeta,
  formatCommit,
  formatRelativeTime,
} from "./service";

// The last column is a fixed width so the header lines up with every row. Below
// 1280px the table is too tight, so rows become cards.
const COLUMNS =
  "xl:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_130px_minmax(0,1.2fr)_90px_90px_250px]";

export function TableHeader() {
  return (
    <div
      className={cn(
        "hidden gap-4 border-b border-line bg-panel px-5 py-3 xl:grid",
        COLUMNS,
      )}
    >
      {["Service", "Repository", "Status", "Latest commit", "Branch", "Updated", ""].map(
        (header, index) => (
          <div
            key={index}
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint"
          >
            {header}
          </div>
        ),
      )}
    </div>
  );
}

export function ServiceSkeleton() {
  return (
    <div>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 border-b border-line px-5 py-5 last:border-b-0"
          style={{ opacity: 1 - index * 0.18 }}
        >
          <div className="h-9 w-9 animate-pulse rounded-hatch bg-line" />
          <div className="space-y-2">
            <div className="h-3 w-40 animate-pulse rounded-hatch bg-line" />
            <div className="h-2.5 w-28 animate-pulse rounded-hatch bg-line/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyServices() {
  return (
    <EmptyStateBlock
      title="No services yet"
      description="Pick a GitHub repository that has a Dockerfile. Hatch creates the service, queues the first deploy and gives it a URL."
      action={
        <Button href="/new" variant="primary" className="h-10">
          Deploy your first service
        </Button>
      }
    />
  );
}

export function ServiceRowItem({
  row,
  onNotice,
  onDeleteQueued,
}: {
  row: ServiceRow;
  onNotice: (notice: NoticePayload | null) => void;
  onDeleteQueued: (project: Project) => void;
}) {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { project, lastDeployment, status, liveUrl, repoSlug } = row;
  const branch = lastDeployment?.branch ?? project.branch;
  const retryingCleanup = project.status === "delete_failed";

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!retryingCleanup && !deleteModalOpen) {
      setDeleteModalOpen(true);
      return;
    }

    setDeleting(true);
    const res = await apiFetch(`/api/projects/${project.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      const nextProject = (await res.json()) as Project;
      onDeleteQueued(nextProject);
      onNotice({
        type: "success",
        title: retryingCleanup ? "Cleanup retry queued" : "Deletion queued",
        message: retryingCleanup
          ? `${project.repo_name} cleanup is being retried.`
          : `${project.repo_name} will disappear after cloud cleanup finishes.`,
      });
      setDeleting(false);
      setDeleteModalOpen(false);
    } else {
      setDeleting(false);
      setDeleteModalOpen(false);
      onNotice({
        type: "error",
        title: "Delete failed",
        message: await readApiError(
          res,
          "We couldn't remove that service right now.",
        ),
      });
    }
  };

  return (
    <article className="border-b border-line transition-colors last:border-b-0 hover:bg-ink/[0.03]">
      <div className={cn("hidden items-center gap-4 px-5 py-4 xl:grid", COLUMNS)}>
        <ServiceIdentity project={project} liveUrl={liveUrl} />
        <RepositoryCell repoUrl={project.repo_url} repoSlug={repoSlug} />
        <StatusBadge status={status} />
        <CommitCell deployment={lastDeployment} />
        <span className="truncate font-mono text-xs text-muted">{branch}</span>
        <span className="truncate text-sm text-muted">
          {formatRelativeTime(row.updatedAtRaw)}
        </span>
        <RowActions
          project={project}
          liveUrl={liveUrl}
          deleting={deleting}
          onDelete={handleDelete}
        />
      </div>

      <div className="px-5 py-5 xl:hidden">
        <div className="flex items-start justify-between gap-4">
          <ServiceIdentity project={project} liveUrl={liveUrl} />
          <StatusBadge status={status} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
          <MobileMeta label="Repository" value={repoSlug} />
          <MobileMeta label="Branch" value={branch} />
          <MobileMeta label="Commit" value={formatCommit(lastDeployment).short} />
          <MobileMeta label="Updated" value={formatRelativeTime(row.updatedAtRaw)} />
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
            {project.auto_deploy ? "Auto-deploy on" : "Manual deploys"}
          </p>
          <RowActions
            project={project}
            liveUrl={liveUrl}
            deleting={deleting}
            onDelete={handleDelete}
            mobile
          />
        </div>
      </div>

      <DeleteServiceModal
        project={project}
        open={deleteModalOpen}
        deleting={deleting}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
      />
    </article>
  );
}

function ServiceIdentity({
  project,
  liveUrl,
}: {
  project: Project;
  liveUrl: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-hatch border border-line-strong text-muted">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-4 w-4"
        >
          <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      </div>
      <div className="min-w-0">
        <Link
          to={`/projects/${project.id}`}
          className="block truncate text-sm font-medium transition-colors hover:text-accent"
        >
          {project.repo_name}
        </Link>
        {liveUrl ? (
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate font-mono text-xs text-faint transition-colors hover:text-ink"
          >
            {liveUrl.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <span className="font-mono text-xs text-faint">
            {project.subdomain || project.id.slice(0, 8)}
          </span>
        )}
      </div>
    </div>
  );
}

function RepositoryCell({
  repoUrl,
  repoSlug,
}: {
  repoUrl: string;
  repoSlug: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <BrandIcon
        icon={siGithub}
        color="currentColor"
        className="h-3.5 w-3.5 shrink-0 text-faint"
      />
      <a
        href={safeHttpUrl(repoUrl) ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate font-mono text-xs text-muted transition-colors hover:text-ink"
      >
        {repoSlug}
      </a>
    </div>
  );
}

const STATUS_TONE = {
  live: "success",
  active: "warning",
  failed: "danger",
  canceled: "muted",
  deleting: "warning",
  suspended: "muted",
  idle: "muted",
} satisfies Record<StatusKind, "success" | "warning" | "danger" | "muted">;

export function StatusBadge({ status }: { status: StatusMeta }) {
  return (
    <StatusText
      tone={STATUS_TONE[status.kind]}
      pulse={status.kind === "active" || status.kind === "deleting"}
      className="max-w-full"
    >
      {status.label}
    </StatusText>
  );
}

function CommitCell({ deployment }: { deployment?: Deployment }) {
  const commit = formatCommit(deployment);

  return (
    <div className="min-w-0">
      <span className="block truncate font-mono text-xs text-muted">{commit.short}</span>
      {commit.message && (
        <p className="mt-0.5 truncate text-xs text-faint">{commit.message}</p>
      )}
    </div>
  );
}

function RowActions({
  project,
  liveUrl,
  deleting,
  onDelete,
  mobile = false,
}: {
  project: Project;
  liveUrl: string | null;
  deleting: boolean;
  onDelete: (e: React.MouseEvent) => void;
  mobile?: boolean;
}) {
  const projectDeleting = project.status === "deleting";
  const projectDeleteFailed = project.status === "delete_failed";

  return (
    <div className={cn("flex items-center gap-4 text-sm", mobile ? "justify-start" : "justify-end")}>
      {liveUrl && (
        <a
          href={liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent transition-colors hover:text-accent-hover"
        >
          Open
        </a>
      )}
      <ActionLink href={`/projects/${project.id}`}>Details</ActionLink>
      <ActionLink href={`/projects/${project.id}/settings`}>Settings</ActionLink>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting || projectDeleting}
        className={cn(
          "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          projectDeleteFailed ? "text-danger" : "text-faint hover:text-danger",
        )}
      >
        {projectDeleting
          ? "Deleting"
          : deleting
            ? "…"
            : projectDeleteFailed
              ? "Retry"
              : "Delete"}
      </button>
    </div>
  );
}

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link to={href} className="text-muted transition-colors hover:text-ink">
      {children}
    </Link>
  );
}

function MobileMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
        {label}
      </p>
      <p className="truncate text-sm text-muted">{value}</p>
    </div>
  );
}
