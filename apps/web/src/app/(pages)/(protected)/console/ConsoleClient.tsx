/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageLoadingState } from "../../../components/LoadingState";
import {
  apiFetch,
  deploymentUrl,
  readApiError,
  redirectIfUnauthorized,
} from "@/app/lib/api";
import {
  NoticeToast,
  type NoticePayload,
} from "../../../components/NoticeToast";

interface Project {
  id: string;
  repo_name: string;
  repo_url: string;
  branch: string;
  subdomain: string | null;
  port: number;
  auto_deploy: boolean;
  status?: string;
  created_at: string;
}

interface Deployment {
  id: string;
  project_id: string;
  status: string;
  branch: string;
  commit_sha?: string | null;
  commit_message?: string | null;
  cpu: number;
  memory_mb: number;
  port: number;
  url: string | null;
  subdomain: string | null;
  created_at: string;
  deployed_at: string | null;
}

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

const CACHE_KEY = "hatch_projects_cache";
const CACHE_TTL = 60 * 1000;
const ACTIVE_STATUSES = new Set(["queued", "building", "deploying"]);
const FAILED_STATUSES = new Set(["failed", "error"]);
const CANCELED_STATUSES = new Set(["canceled", "cancelled"]);

export default function ConsoleClient() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [deployments, setDeployments] = useState<Record<string, Deployment[]>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [notice, setNotice] = useState<NoticePayload | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const loadData = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const res = await apiFetch("/api/projects");
        if (redirectIfUnauthorized(res, router)) return;
        if (!res.ok) {
          throw new Error(await readApiError(res, "Failed to fetch projects"));
        }

        const data = await res.json();
        const projectsList: Project[] = Array.isArray(data) ? data : [];

        const deploymentResults = await Promise.all(
          projectsList.map(async (project) => {
            const dRes = await apiFetch(
              `/api/projects/${project.id}/deployments`,
            );
            if (redirectIfUnauthorized(dRes, router)) {
              return { id: project.id, data: [] as Deployment[] };
            }
            if (!dRes.ok) {
              return { id: project.id, data: [] as Deployment[] };
            }
            const dData = await dRes.json();
            return {
              id: project.id,
              data: Array.isArray(dData) ? dData : ([] as Deployment[]),
            };
          }),
        );

        const deploymentMap = deploymentResults.reduce(
          (acc, curr) => {
            acc[curr.id] = curr.data;
            return acc;
          },
          {} as Record<string, Deployment[]>,
        );

        setProjects(projectsList);
        setDeployments(deploymentMap);
        setLastSyncedAt(new Date());
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            projects: projectsList,
            deployments: deploymentMap,
            timestamp: Date.now(),
          }),
        );
      } catch {
        setNotice({
          type: "error",
          title: "Dashboard unavailable",
          message: "We couldn't load the latest service list.",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router],
  );

  useEffect(() => {
    setMounted(true);

    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const cacheAge = Date.now() - (parsed.timestamp || 0);

        if (cacheAge < CACHE_TTL) {
          setProjects(parsed.projects || []);
          setDeployments(parsed.deployments || {});
          setLastSyncedAt(new Date(parsed.timestamp));
          setLoading(false);
          loadData({ background: true });
          return;
        }
      } catch {}
    }

    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

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
  const hasActiveDeployments = rows.some((row) => row.status.kind === "active");
  const hasProjectTransitions = rows.some((row) =>
    ["deleting", "suspending", "resuming"].includes(row.status.raw),
  );

  useEffect(() => {
    if (!hasActiveDeployments && !hasProjectTransitions) return;
    const interval = window.setInterval(() => {
      loadData({ background: true });
    }, 8000);
    return () => window.clearInterval(interval);
  }, [hasActiveDeployments, hasProjectTransitions, loadData]);

  const stats = useMemo(() => {
    return {
      total: rows.length,
      live: rows.filter((row) => row.status.kind === "live").length,
      active: rows.filter((row) => row.status.kind === "active").length,
      failed: rows.filter((row) => row.status.kind === "failed").length,
    };
  }, [rows]);

  const handleDeleteQueued = (project: Project) => {
    setProjects((prev) =>
      prev.map((item) => (item.id === project.id ? project : item)),
    );
    localStorage.removeItem(CACHE_KEY);
  };

  if (!mounted) return <PageLoadingState />;

  return (
    <div className="w-full min-h-screen bg-black text-white">
      <NoticeToast notice={notice} onDismiss={() => setNotice(null)} />
      <main className="w-full px-5 sm:px-6 lg:px-10 py-6 lg:py-8">
        <ConsoleHeader
          lastSyncedAt={lastSyncedAt}
          refreshing={refreshing}
          onRefresh={() => loadData({ background: true })}
        />

        {!loading && hasProjects && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#1a1a1a] border border-[#1a1a1a] rounded-[6px] mb-6 overflow-hidden">
            <StatCard label="Services" value={stats.total.toString()} />
            <StatCard label="Live" value={stats.live.toString()} accent="live" />
            <StatCard
              label="Building"
              value={stats.active.toString()}
              accent="active"
            />
            <StatCard
              label="Failed"
              value={stats.failed.toString()}
              accent="failed"
            />
          </div>
        )}

        <div className="w-full border border-[#1a1a1a] rounded-[6px] overflow-hidden bg-[#030303] shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
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
        </div>
      </main>
    </div>
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
    <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between mb-8">
      <div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-white">
          Services
        </h1>
        <p className="text-[12px] text-zinc-600 mt-2 tracking-wide max-w-xl">
          Deploy, inspect, and route the workloads running through your Hatch
          control plane.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="text-left sm:text-right">
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#333] font-bold">
            {refreshing ? "Refreshing" : "Last synced"}
          </p>
          <p className="text-[11px] text-zinc-600 mt-1">
            {lastSyncedAt ? formatRelativeTime(lastSyncedAt.toISOString()) : "—"}
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="h-9 px-4 border border-[#1a1a1a] rounded-[3px] text-[10px] uppercase tracking-widest font-bold text-zinc-400 hover:text-white hover:border-zinc-600 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {refreshing ? "Syncing" : "Refresh"}
        </button>
        <Link
          href="/new"
          className="h-9 px-4 bg-white text-black rounded-[3px] text-[10px] uppercase tracking-widest font-bold hover:bg-zinc-200 transition-colors flex items-center justify-center cursor-pointer"
        >
          + New Service
        </Link>
      </div>
    </div>
  );
}

function TableHeader() {
  return (
    <div className="hidden lg:grid grid-cols-[2fr_1.45fr_0.9fr_1.1fr_0.75fr_0.75fr_190px] px-5 bg-[#050505] border-b border-[#1a1a1a]">
      {[
        "Service",
        "Repository",
        "Status",
        "Latest Commit",
        "Branch",
        "Updated",
        "Actions",
      ].map((header, index) => (
        <div
          key={header}
          className={`py-3 text-[9px] uppercase tracking-[0.18em] text-[#3a3a3a] font-bold ${
            index === 6 ? "text-right" : ""
          }`}
        >
          {header}
        </div>
      ))}
    </div>
  );
}

function ServiceSkeleton() {
  return (
    <div>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="grid lg:grid-cols-[2fr_1.45fr_0.9fr_1.1fr_0.75fr_0.75fr_190px] px-5 py-4 border-b border-[#111] items-center last:border-b-0 gap-4"
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

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "live" | "active" | "failed";
}) {
  const valueColor =
    accent === "live"
      ? "text-[#3fba78]"
      : accent === "active"
        ? "text-[#facc15]"
        : accent === "failed"
          ? "text-[#d05252]"
          : "text-white";

  return (
    <div className="bg-[#080808] px-5 py-4 min-w-0">
      <p className="text-[9px] uppercase tracking-[0.15em] text-[#444] mb-1.5">
        {label}
      </p>
      <p className={`text-2xl font-medium tracking-tight ${valueColor}`}>
        {value}
      </p>
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { project, lastDeployment, status, liveUrl, repoSlug } = row;
  const branch = lastDeployment?.branch ?? project.branch;

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 4500);
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
        title: "Deletion queued",
        message: `${project.repo_name} will disappear after cloud cleanup finishes.`,
      });
      setDeleting(false);
      setConfirmDelete(false);
    } else {
      setDeleting(false);
      setConfirmDelete(false);
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
    <article className="group border-b border-[#111] last:border-b-0 hover:bg-white/[0.018] transition-colors">
      <div className="hidden lg:grid grid-cols-[2fr_1.45fr_0.9fr_1.1fr_0.75fr_0.75fr_190px] px-5 py-4 items-center">
        <ServiceIdentity project={project} liveUrl={liveUrl} />
        <RepositoryCell repoUrl={project.repo_url} repoSlug={repoSlug} />
        <StatusBadge status={status} />
        <CommitCell deployment={lastDeployment} />
        <TextCell value={branch} mono />
        <TextCell value={formatRelativeTime(row.updatedAtRaw)} />
        <RowActions
          project={project}
          liveUrl={liveUrl}
          confirmDelete={confirmDelete}
          deleting={deleting}
          onDelete={handleDelete}
        />
      </div>

      <div className="lg:hidden p-5">
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
            confirmDelete={confirmDelete}
            deleting={deleting}
            onDelete={handleDelete}
            mobile
          />
        </div>
      </div>
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
      <div className="w-8 h-8 flex items-center justify-center bg-[#0d0d0d] border border-[#222] rounded-[4px] flex-shrink-0">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-3.5 h-3.5 text-zinc-500"
        >
          <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      </div>
      <div className="min-w-0">
        <Link
          href={`/projects/${project.id}`}
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
        <img
          src="https://cdn.simpleicons.org/github/555555"
          alt="GitHub"
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
  const text = {
    live: "text-[#3fba78]",
    active: "text-[#facc15]",
    failed: "text-[#d05252]",
    canceled: "text-zinc-500",
    deleting: "text-[#b8872f]",
    suspended: "text-zinc-500",
    idle: "text-zinc-700",
  } satisfies Record<StatusKind, string>;

  const dot = {
    live: "bg-[#2f9d63] shadow-[0_0_8px_rgba(47,157,99,0.35)]",
    active: "bg-[#facc15] animate-pulse",
    failed: "bg-[#b83a3a]",
    canceled: "bg-zinc-500",
    deleting: "bg-[#b8872f] animate-pulse",
    suspended: "bg-zinc-600",
    idle: "bg-zinc-800",
  } satisfies Record<StatusKind, string>;

  return (
    <div className="w-fit max-w-full flex items-center gap-2">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot[status.kind]}`} />
      <span
        className={`text-[10px] uppercase tracking-widest font-bold truncate ${text[status.kind]}`}
      >
        {status.label}
      </span>
    </div>
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
  confirmDelete,
  deleting,
  onDelete,
  mobile = false,
}: {
  project: Project;
  liveUrl: string | null;
  confirmDelete: boolean;
  deleting: boolean;
  onDelete: (e: React.MouseEvent) => void;
  mobile?: boolean;
}) {
  const projectDeleting = project.status === "deleting";
  return (
    <div
      className={`flex items-center justify-end gap-2 ${mobile ? "flex-wrap" : ""}`}
    >
      {liveUrl && (
        <a
          href={liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="h-7 px-2.5 border border-[#222] rounded-[3px] text-[9px] uppercase tracking-widest font-bold text-zinc-400 hover:text-white hover:border-zinc-500 transition-all cursor-pointer flex items-center"
        >
          Open
        </a>
      )}
      <Link
        href={`/projects/${project.id}`}
        className="h-7 px-2.5 border border-[#222] rounded-[3px] text-[9px] uppercase tracking-widest font-bold text-zinc-400 hover:text-white hover:border-zinc-500 transition-all flex items-center cursor-pointer"
      >
        Details
      </Link>
      <Link
        href={`/projects/${project.id}/settings`}
        className="hidden sm:flex h-7 px-2.5 border border-[#222] rounded-[3px] text-[9px] uppercase tracking-widest font-bold text-zinc-500 hover:text-white hover:border-zinc-500 transition-all items-center cursor-pointer"
      >
        Settings
      </Link>
      <button
        onClick={onDelete}
        disabled={deleting || projectDeleting}
        className={`h-7 px-2.5 border rounded-[3px] text-[9px] uppercase tracking-widest font-bold transition-all cursor-pointer disabled:cursor-not-allowed ${
          confirmDelete
            ? "text-[#d05252] border-[#5a1d1d] bg-[#1a0808] hover:border-[#7a2a2a]"
            : "text-zinc-700 border-[#1a1a1a] hover:text-[#d05252] hover:border-[#5a1d1d]"
        } disabled:opacity-50`}
      >
        {projectDeleting ? "Deleting" : deleting ? "..." : confirmDelete ? "Confirm" : "Del"}
      </button>
    </div>
  );
}

function MobileMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#111] rounded-[3px] bg-[#050505] px-3 py-2 min-w-0">
      <p className="text-[9px] uppercase tracking-[0.2em] text-[#333] font-bold mb-1">
        {label}
      </p>
      <p className="text-[11px] text-zinc-500 truncate">{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 sm:py-24 border-t border-[#1a1a1a] px-6 text-center">
      <div className="w-11 h-11 border border-[#222] rounded-[4px] flex items-center justify-center mb-6 bg-[#080808]">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          className="w-5 h-5 text-zinc-600"
        >
          <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      </div>
      <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.35em] mb-3">
        No services yet
      </p>
      <p className="text-sm text-zinc-700 max-w-md leading-relaxed mb-7">
        Import a GitHub repository with a Dockerfile. Hatch will create the
        project, queue the first deployment, and assign a production URL.
      </p>
      <Link
        href="/new"
        className="text-[10px] bg-white text-black px-8 py-3 rounded-[3px] uppercase font-bold tracking-widest hover:bg-zinc-200 transition-all"
      >
        Deploy your first service
      </Link>
    </div>
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
