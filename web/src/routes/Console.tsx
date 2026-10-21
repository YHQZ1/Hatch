import {
  type UseQueryResult,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { siGithub } from "simple-icons";
import BrandIcon from "@/components/BrandIcon";
import { NoticeToast, type NoticePayload } from "@/components/NoticeToast";
import {
  AppShell,
  Button,
  EmptyStateBlock,
  MetricCard,
  Modal,
  PageTitle,
  Panel,
  StatusText,
} from "@/components/ui";
import { apiFetch, deploymentUrl, readApiError } from "@/lib/api";
import {
  ACTIVE_DEPLOYMENT_STATUSES as ACTIVE_STATUSES,
  NO_DEPLOYMENTS,
  NO_PROJECTS,
  projectDeploymentsQuery,
  projectsQuery,
} from "@/lib/queries";
import type { Deployment, Project } from "@/lib/types";

interface ServiceRow {
  project: Project;
  lastDeployment?: Deployment;
  status: StatusMeta;
  liveUrl: string | null;
  repoSlug: string;
  updatedAtRaw: string;
}

type StatusKind =
  | "live"
  | "active"
  | "failed"
  | "canceled"
  | "deleting"
  | "suspended"
  | "idle";

interface StatusMeta {
  label: string;
  kind: StatusKind;
  raw: string;
}

const FAILED_STATUSES = new Set(["failed", "error"]);
const CANCELED_STATUSES = new Set(["canceled", "cancelled"]);

const LOAD_FAILED_NOTICE: NoticePayload = {
  type: "error",
  title: "Dashboard unavailable",
  message: "We couldn't load the latest service list.",
};

/** The deployments of each project, in the order the projects were given. */
function combineDeployments(results: UseQueryResult<Deployment[]>[]) {
  return {
    byIndex: results.map((result) => result.data),
    pending: results.some((result) => result.isPending),
    fetching: results.some((result) => result.isFetching),
    updatedAt: Math.max(0, ...results.map((result) => result.dataUpdatedAt)),
  };
}

export default function ConsoleClient() {
  const queryClient = useQueryClient();
  const projectsResult = useQuery(projectsQuery());
  const projects = projectsResult.data ?? NO_PROJECTS;
  const deploymentResults = useQueries({
    queries: projects.map((project) => projectDeploymentsQuery(project.id)),
    combine: combineDeployments,
  });
  const [notice, setNotice] = useState<NoticePayload | null>(null);
  const [loadErrorDismissedAt, setLoadErrorDismissedAt] = useState(0);

  const deployments = useMemo(() => {
    const byProject: Record<string, Deployment[]> = {};
    projects.forEach((project, index) => {
      byProject[project.id] = deploymentResults.byIndex[index] ?? NO_DEPLOYMENTS;
    });
    return byProject;
  }, [projects, deploymentResults.byIndex]);

  const loading = projectsResult.isPending || deploymentResults.pending;
  const refreshing =
    !loading && (projectsResult.isFetching || deploymentResults.fetching);
  const lastSyncedAt = projectsResult.dataUpdatedAt
    ? new Date(Math.max(projectsResult.dataUpdatedAt, deploymentResults.updatedAt))
    : null;

  const loadFailed =
    projectsResult.isError &&
    projectsResult.errorUpdatedAt > loadErrorDismissedAt;
  const shownNotice = notice ?? (loadFailed ? LOAD_FAILED_NOTICE : null);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!loadFailed) return;
    const timeout = window.setTimeout(
      () => setLoadErrorDismissedAt(Date.now()),
      5000,
    );
    return () => window.clearTimeout(timeout);
  }, [loadFailed]);

  const rows = useMemo(() => {
    return projects
      .map((project) => {
        const lastDeployment = deployments[project.id]?.[0];
        const updatedAtRaw =
          lastDeployment?.deployed_at ??
          lastDeployment?.created_at ??
          project.created_at;

        return {
          project,
          lastDeployment,
          status: getProjectStatusMeta(project, lastDeployment),
          liveUrl: getServiceUrl(project, lastDeployment),
          repoSlug: formatRepoSlug(project.repo_url),
          updatedAtRaw,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAtRaw).getTime() -
          new Date(a.updatedAtRaw).getTime(),
      );
  }, [deployments, projects]);

  const hasProjects = rows.length > 0;

  const stats = useMemo(() => {
    return {
      total: rows.length,
      live: rows.filter((row) => row.status.kind === "live").length,
      active: rows.filter((row) => row.status.kind === "active").length,
      failed: rows.filter((row) => row.status.kind === "failed").length,
    };
  }, [rows]);

  const pulse = useMemo(() => getConsolePulse(rows), [rows]);

  const handleDeleteQueued = (project: Project) => {
    queryClient.setQueryData<Project[]>(projectsQuery().queryKey, (current) =>
      current?.map((item) => (item.id === project.id ? project : item)),
    );
  };

  return (
    <AppShell>
      <NoticeToast
        notice={shownNotice}
        onDismiss={() => {
          setNotice(null);
          setLoadErrorDismissedAt(Date.now());
        }}
      />
      <ConsoleHeader
        lastSyncedAt={lastSyncedAt}
        refreshing={refreshing}
        onRefresh={() =>
          void queryClient.invalidateQueries({ queryKey: projectsQuery().queryKey })
        }
      />

      {!loading && hasProjects && (
        <>
          <div className="mb-7 grid grid-cols-2 gap-x-8 gap-y-4 border-b border-white/[0.08] pb-7 sm:flex sm:items-end sm:gap-12">
            <MetricCard label="Services" value={stats.total.toString()} />
            <MetricCard
              label="Live"
              value={stats.live.toString()}
              tone="success"
            />
            <MetricCard
              label="Building"
              value={stats.active.toString()}
              tone="warning"
            />
            <MetricCard
              label="Failed"
              value={stats.failed.toString()}
              tone="danger"
            />
          </div>
          <ConsolePulse pulse={pulse} />
        </>
      )}

      <Panel className="w-full">
        {(hasProjects || loading) && <TableHeader />}

        {loading ? (
          <ServiceSkeleton />
        ) : !hasProjects ? (
          <EmptyState />
        ) : (
          <div>
            {rows.map((row) => (
              <ProjectRow
                key={row.project.id}
                row={row}
                onNotice={setNotice}
                onDeleteQueued={handleDeleteQueued}
              />
            ))}
          </div>
        )}
      </Panel>
    </AppShell>
  );
}

function ConsoleHeader({
  lastSyncedAt,
  refreshing,
  onRefresh,
}: {
  lastSyncedAt: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <PageTitle
      title="Services"
      description="Deploy, inspect, and route every workload running through your Hatch control plane."
      actions={
        <>
          <div className="mr-1 min-w-24 text-left sm:text-right">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-700 font-bold">
              {refreshing ? "Refreshing" : "Last synced"}
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">
              {lastSyncedAt
                ? formatRelativeTime(lastSyncedAt.toISOString())
                : "—"}
            </p>
          </div>
          <Button onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Syncing" : "Refresh"}
          </Button>
          <Button href="/new" variant="primary">
            + New Service
          </Button>
        </>
      }
    />
  );
}

function TableHeader() {
  return (
    <div className="hidden lg:grid grid-cols-[2fr_1.45fr_0.9fr_1.1fr_0.75fr_0.75fr_230px] border-b border-white/[0.08] px-1">
      {[
        "Service",
        "Repository",
        "Status",
        "Latest Commit",
        "Branch",
        "Updated",
        "Manage",
      ].map((header, index) => (
        <div
          key={header}
          className={`py-3 text-[9px] uppercase tracking-[0.18em] text-zinc-700 font-bold ${
            index === 6 ? "text-right" : ""
          }`}
        >
          {header}
        </div>
      ))}
    </div>
  );
}

function ConsolePulse({
  pulse,
}: {
  pulse: {
    latest: ServiceRow | null;
    attention: ServiceRow[];
    active: ServiceRow[];
    autoDeployCount: number;
  };
}) {
  const latestName = pulse.latest?.project.repo_name ?? "No deployments";
  const latestMeta = pulse.latest
    ? `${pulse.latest.status.label} · ${formatRelativeTime(pulse.latest.updatedAtRaw)}`
    : "Waiting for first deploy";
  const attentionLabel =
    pulse.attention.length === 0
      ? "All clear"
      : `${pulse.attention.length} service${pulse.attention.length === 1 ? "" : "s"}`;
  const activeLabel =
    pulse.active.length === 0
      ? "Idle"
      : `${pulse.active.length} running`;

  return (
    <section className="mb-8 grid gap-y-5 border-b border-white/[0.08] pb-7 md:grid-cols-[1.3fr_0.9fr_0.8fr_0.8fr] md:divide-x md:divide-white/[0.07]">
      <PulseItem
        label="Latest deployment"
        value={latestName}
        detail={latestMeta}
      />
      <PulseItem
        label="Needs attention"
        value={attentionLabel}
        detail={
          pulse.attention[0]
            ? pulse.attention[0].project.repo_name
            : "No failed services"
        }
        tone={pulse.attention.length > 0 ? "danger" : "muted"}
      />
      <PulseItem
        label="Active work"
        value={activeLabel}
        detail={
          pulse.active[0]
            ? pulse.active[0].project.repo_name
            : "No builds in progress"
        }
        tone={pulse.active.length > 0 ? "warning" : "muted"}
      />
      <PulseItem
        label="Auto-deploy"
        value={`${pulse.autoDeployCount} enabled`}
        detail="GitHub push triggers"
      />
    </section>
  );
}

function PulseItem({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: PulseTone;
}) {
  const valueColor = {
    default: "text-zinc-100",
    warning: "text-[#d8ad4f]",
    danger: "text-[#d86666]",
    muted: "text-zinc-500",
  } satisfies Record<PulseTone, string>;

  return (
    <div className="min-w-0 md:px-5 first:md:pl-0">
      <p className="mb-2 font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-700">
        {label}
      </p>
      <p className={`truncate text-sm font-medium ${valueColor[tone]}`}>
        {value}
      </p>
      <p className="mt-1 truncate text-[11px] text-zinc-600">{detail}</p>
    </div>
  );
}

type PulseTone = "default" | "warning" | "danger" | "muted";

function ServiceSkeleton() {
  return (
    <div>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="grid lg:grid-cols-[2fr_1.45fr_0.9fr_1.1fr_0.75fr_0.75fr_230px] px-1 py-4 border-b border-white/[0.055] items-center last:border-b-0 gap-4"
          style={{ opacity: 1 - index * 0.14 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-900 rounded-[4px] animate-pulse" />
            <div className="space-y-2">
              <div className="h-2.5 w-32 bg-zinc-900 rounded-full animate-pulse" />
              <div className="h-2 w-24 bg-zinc-900/50 rounded-full animate-pulse" />
            </div>
          </div>
          <div className="hidden lg:block h-2 w-36 bg-zinc-900/70 rounded-full animate-pulse" />
          <div className="hidden lg:block h-2 w-16 bg-zinc-900/70 rounded-full animate-pulse" />
          <div className="hidden lg:block h-2 w-24 bg-zinc-900/50 rounded-full animate-pulse" />
          <div className="hidden lg:block h-2 w-12 bg-zinc-900/50 rounded-full animate-pulse" />
          <div className="hidden lg:block h-2 w-12 bg-zinc-900/50 rounded-full animate-pulse" />
          <div className="hidden lg:block h-6 w-24 bg-zinc-900/70 rounded-[2px] animate-pulse ml-auto" />
        </div>
      ))}
    </div>
  );
}

function ProjectRow({
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
    <article className="group border-b border-white/[0.055] last:border-b-0 transition-colors hover:bg-white/[0.018]">
      <div className="hidden lg:grid grid-cols-[2fr_1.45fr_0.9fr_1.1fr_0.75fr_0.75fr_230px] px-1 py-4 items-center">
        <ServiceIdentity project={project} liveUrl={liveUrl} />
        <RepositoryCell repoUrl={project.repo_url} repoSlug={repoSlug} />
        <StatusBadge status={status} />
        <CommitCell deployment={lastDeployment} />
        <TextCell value={branch} mono />
        <TextCell value={formatRelativeTime(row.updatedAtRaw)} />
        <RowActions
          project={project}
          liveUrl={liveUrl}
          deleting={deleting}
          onDelete={handleDelete}
        />
      </div>

      <div className="lg:hidden py-5">
        <div className="flex items-start justify-between gap-4">
          <ServiceIdentity project={project} liveUrl={liveUrl} />
          <StatusBadge status={status} />
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <MobileMeta label="Repo" value={repoSlug} />
          <MobileMeta label="Branch" value={branch} />
          <MobileMeta
            label="Commit"
            value={formatCommit(lastDeployment).short}
          />
          <MobileMeta
            label="Updated"
            value={formatRelativeTime(row.updatedAtRaw)}
          />
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="text-[10px] text-zinc-700 font-mono uppercase tracking-widest">
            {project.auto_deploy ? "Auto-deploy on" : "Manual deploys"}
          </div>
          <RowActions
            project={project}
            liveUrl={liveUrl}
            deleting={deleting}
            onDelete={handleDelete}
            mobile
          />
        </div>
      </div>
      <DeleteProjectModal
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
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-4 h-4 text-zinc-500"
        >
          <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      </div>
      <div className="min-w-0">
        <Link
          to={`/projects/${project.id}`}
          className="text-[13px] font-medium text-zinc-100 hover:text-white hover:underline decoration-zinc-700 underline-offset-3 block truncate cursor-pointer"
        >
          {project.repo_name}
        </Link>
        {liveUrl ? (
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-zinc-600 font-mono hover:text-white transition-colors truncate block cursor-pointer"
          >
            {liveUrl.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <span className="text-[10px] text-zinc-800 font-mono">
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
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <BrandIcon
          icon={siGithub}
          color="555555"
          className="w-3 h-3 flex-shrink-0"
        />
        <a
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-zinc-500 font-mono truncate hover:text-zinc-300 transition-colors cursor-pointer"
        >
          {repoSlug}
        </a>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: StatusMeta;
}) {
  const tone = {
    live: "success",
    active: "warning",
    failed: "danger",
    canceled: "muted",
    deleting: "warning",
    suspended: "muted",
    idle: "muted",
  } satisfies Record<StatusKind, "success" | "warning" | "danger" | "muted">;

  return (
    <StatusText
      tone={tone[status.kind]}
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
      <span className="text-[11px] text-zinc-500 font-mono truncate block">
        {commit.short}
      </span>
      {commit.message && (
        <p className="text-[10px] text-zinc-700 mt-0.5 truncate">
          {commit.message}
        </p>
      )}
    </div>
  );
}

function TextCell({ value, mono = false }: { value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <span
        className={`text-[11px] text-zinc-600 truncate block ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </span>
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
    <div
      className={`flex items-center justify-end gap-3 ${mobile ? "flex-wrap" : ""}`}
    >
      {liveUrl && (
        <ActionAnchor href={liveUrl} external>
          Open
        </ActionAnchor>
      )}
      <ActionAnchor href={`/projects/${project.id}`}>
        Details
      </ActionAnchor>
      <ActionAnchor href={`/projects/${project.id}/settings`} className="hidden sm:inline">
        Settings
      </ActionAnchor>
      <button
        onClick={onDelete}
        disabled={deleting || projectDeleting}
        className={`text-[10px] font-medium transition-colors cursor-pointer disabled:cursor-not-allowed ${
          projectDeleteFailed
            ? "text-[#d86666] hover:text-[#ef8b8b]"
            : "text-zinc-700 hover:text-[#d86666]"
        } disabled:opacity-50`}
      >
        {projectDeleting
          ? "Deleting"
          : deleting
            ? "..."
            : projectDeleteFailed
              ? "Retry"
              : "Delete"}
      </button>
    </div>
  );
}

function DeleteProjectModal({
  project,
  open,
  deleting,
  onClose,
  onConfirm,
}: {
  project: Project;
  open: boolean;
  deleting: boolean;
  onClose: () => void;
  onConfirm: (e: React.MouseEvent) => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const canDelete = confirmation === project.repo_name;

  const handleClose = () => {
    setConfirmation("");
    onClose();
  };

  const handleConfirm = (event: React.MouseEvent) => {
    setConfirmation("");
    onConfirm(event);
  };

  return (
    <Modal
      open={open}
      title={`Delete ${project.repo_name}?`}
      description="Hatch will queue cloud cleanup and remove this service after the AWS resources are gone."
      onClose={deleting ? () => {} : handleClose}
    >
      <div className="border-y border-white/[0.08] py-3">
        <p className="font-mono text-[11px] text-zinc-500 truncate">
          {project.repo_url}
        </p>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Existing deployment URLs will stop serving once cleanup completes.
          This action cannot be undone from the console.
        </p>
      </div>
      <label className="mt-4 block">
        <span className="block text-[11px] leading-5 text-zinc-500">
          Type{" "}
          <span className="font-mono text-zinc-300">{project.repo_name}</span>{" "}
          to confirm.
        </span>
        <input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={deleting}
          autoFocus
          className="mt-2 h-10 w-full rounded-lg border border-white/[0.09] bg-black/30 px-3 font-mono text-sm text-white outline-none transition-colors placeholder:text-zinc-800 focus:border-white/25 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder={project.repo_name}
        />
      </label>
      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleClose}
          disabled={deleting}
          className="text-[11px] font-medium text-zinc-500 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={deleting || !canDelete}
          className="h-9 px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#d86666] transition-colors hover:text-[#ef8b8b] disabled:cursor-not-allowed disabled:text-zinc-700 cursor-pointer"
        >
          {deleting ? "Deleting" : "Delete service"}
        </button>
      </div>
    </Modal>
  );
}

function ActionAnchor({
  href,
  children,
  external = false,
  className,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  className?: string;
}) {
  const classes = `text-[10px] font-medium text-zinc-500 transition-colors hover:text-white cursor-pointer ${className ?? ""}`;

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {children}
      </a>
    );
  }

  return (
    <Link to={href} className={classes}>
      {children}
    </Link>
  );
}

function MobileMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-white/[0.06] pb-2">
      <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-700 font-bold mb-1">
        {label}
      </p>
      <p className="text-[11px] text-zinc-500 truncate">{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <EmptyStateBlock
      title="No services yet"
      description="Import a GitHub repository with a Dockerfile. Hatch will create the project, queue the first deployment, and assign a production URL."
      action={
        <Button href="/new" variant="primary">
          Deploy your first service
        </Button>
      }
    />
  );
}

function getProjectStatusMeta(project: Project, deployment?: Deployment): StatusMeta {
  const projectStatus = (project.status || "active").toLowerCase();
  if (projectStatus === "deleting") {
    return { raw: projectStatus, label: "Deleting", kind: "deleting" };
  }
  if (projectStatus === "suspending") {
    return { raw: projectStatus, label: "Suspending", kind: "active" };
  }
  if (projectStatus === "resuming") {
    return { raw: projectStatus, label: "Resuming", kind: "active" };
  }
  if (projectStatus === "suspended") {
    return { raw: projectStatus, label: "Suspended", kind: "suspended" };
  }
  if (projectStatus === "suspend_failed" || projectStatus === "resume_failed") {
    return { raw: projectStatus, label: "Runtime failed", kind: "failed" };
  }
  if (projectStatus === "delete_failed") {
    return { raw: projectStatus, label: "Delete failed", kind: "failed" };
  }
  return getStatusMeta(deployment?.status);
}

function getStatusMeta(status?: string | null): StatusMeta {
  const raw = (status || "none").toLowerCase();

  if (raw === "live") return { raw, label: "Live", kind: "live" };
  if (ACTIVE_STATUSES.has(raw)) {
    return {
      raw,
      label: raw === "queued" ? "Queued" : raw,
      kind: "active",
    };
  }
  if (FAILED_STATUSES.has(raw)) return { raw, label: "Failed", kind: "failed" };
  if (CANCELED_STATUSES.has(raw)) {
    return { raw, label: "Canceled", kind: "canceled" };
  }
  return { raw, label: "No deploys", kind: "idle" };
}

function getServiceUrl(project: Project, deployment?: Deployment) {
  const candidate =
    deployment?.url ||
    deployment?.subdomain ||
    project.subdomain ||
    null;

  if (!candidate) return null;
  return deploymentUrl(candidate);
}

function formatRepoSlug(url: string) {
  return url
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/\.git$/, "");
}

function formatCommit(deployment?: Deployment): {
  short: string;
  message: string | null;
} {
  const sha = deployment?.commit_sha?.trim();
  const message = deployment?.commit_message?.trim() || null;

  if (!sha) {
    return { short: "—", message };
  }

  return {
    short: sha.slice(0, 7),
    message,
  };
}

function getConsolePulse(rows: ServiceRow[]) {
  return {
    latest: rows[0] ?? null,
    attention: rows.filter((row) => row.status.kind === "failed"),
    active: rows.filter((row) => row.status.kind === "active"),
    autoDeployCount: rows.filter((row) => row.project.auto_deploy).length,
  };
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (Number.isNaN(date.getTime())) return "—";
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
