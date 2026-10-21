/* eslint-disable react-hooks/exhaustive-deps */
import { Link, useNavigate, useParams } from "react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { PageLoadingState } from "@/components/LoadingState";
import {
  AppShell,
  Button,
  PageTitle,
  StatusText,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  NoticeToast,
  type NoticePayload,
} from "@/components/NoticeToast";
import {
  apiFetch,
  consumeFlashNotice,
  deploymentUrl,
  readApiError,
  redirectIfUnauthorized,
  websocketUrl,
} from "@/lib/api";

interface Project {
  id: string;
  repo_name: string;
  repo_url: string;
  branch: string;
  port: number;
  dockerfile_path: string;
  subdomain: string | null;
  auto_deploy: boolean;
  created_at: string;
}

interface Deployment {
  id: string;
  project_id: string;
  branch: string;
  status: string;
  commit_sha?: string | null;
  commit_message?: string | null;
  cpu: number;
  memory_mb: number;
  port: number;
  health_check: string;
  image_uri: string | null;
  subdomain: string | null;
  url: string | null;
  created_at: string;
  deployed_at: string | null;
}

interface LogLine {
  text: string;
  type: "info" | "success" | "error" | "muted" | "system";
  timestamp: string;
}

const CACHE_KEY_PREFIX = "hatch_project_";
const CACHE_TTL = 2 * 60 * 1000;

export default function ProjectDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [activeDeployment, setActiveDeployment] = useState<Deployment | null>(
    null,
  );
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<NoticePayload | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [logs.length, scrollToBottom]);

  useEffect(() => {
    setMounted(true);
    const flash = consumeFlashNotice();
    if (flash) {
      setNotice(flash as NoticePayload);
    }

    const cacheKey = `${CACHE_KEY_PREFIX}${projectId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - (parsed.timestamp || 0) < CACHE_TTL) {
          setProject(parsed.project);
          setDeployments(parsed.deployments || []);
          if (parsed.deployments?.length > 0)
            setActiveDeployment(parsed.deployments[0]);
          setLoading(false);
        }
      } catch {
        // A corrupt cache entry is ignored.
      }
    }

    const loadData = async () => {
      try {
        const [projRes, depsRes] = await Promise.all([
          apiFetch(`/api/projects/${projectId}`),
          apiFetch(`/api/projects/${projectId}/deployments`),
        ]);
        if (
          redirectIfUnauthorized(projRes, navigate) ||
          redirectIfUnauthorized(depsRes, navigate)
        ) {
          return;
        }
        const proj = await projRes.json();
        const deps = await depsRes.json();
        const depList: Deployment[] = Array.isArray(deps) ? deps : [];
        setProject(proj);
        setDeployments(depList);
        if (depList.length > 0) setActiveDeployment(depList[0]);
        localStorage.setItem(
          cacheKey,
          JSON.stringify({
            project: proj,
            deployments: depList,
            timestamp: Date.now(),
          }),
        );
      } catch {
        setNotice({
          type: "error",
          title: "Project unavailable",
          message: "We couldn't load the latest project state.",
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [projectId, navigate]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!activeDeployment) return;
    const currentId = activeDeployment.id;
    activeIdRef.current = currentId;
    setLogs([]);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const s = activeDeployment.status.toLowerCase();
    const isActive = ["building", "deploying", "queued"].includes(s);

    if (isActive) {
      const wsUrl = websocketUrl(`/ws/deployments/${currentId}`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send("READY");
      };
      ws.onmessage = (event) => {
        const line = event.data;
        if (line === "READY" || activeIdRef.current !== currentId) return;
        setLogs((prev) => [...prev, parseLogLine(line)]);

        const nextStatus = statusFromLogLine(line);
        if (nextStatus) {
          updateDeploymentStatus(currentId, nextStatus);
        }

        const nextUrl = deploymentUrlFromLogLine(line);
        if (nextUrl) {
          updateDeploymentUrl(currentId, nextUrl);
        }

        if (
          nextStatus &&
          ["live", "failed", "canceled"].includes(nextStatus)
        ) {
          ws.close();
        }
      };
    } else {
      apiFetch(`/api/deployments/${currentId}/logs`)
        .then((r) => r.json())
        .then((history) => {
          if (activeIdRef.current === currentId && Array.isArray(history)) {
            setLogs(history.map(parseLogLine));
          }
        });
    }

    return () => wsRef.current?.close();
  }, [activeDeployment?.id]);

  const parseLogLine = (line: string): LogLine => {
    const lower = line.toLowerCase();
    const isSuccess =
      line.includes("✓") ||
      line.includes("successfully") ||
      lower.includes("deployment live at") ||
      lower.includes("target healthy");
    const isError =
      line.includes("✗") ||
      lower.includes("error") ||
      lower.includes("failed");
    const isSystem = line.startsWith("[") || line.includes("STEP");
    return {
      text: line,
      type: isSuccess
        ? "success"
        : isError
          ? "error"
          : isSystem
            ? "system"
            : "muted",
      timestamp: new Date().toLocaleTimeString([], {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    };
  };

  const updateDeploymentStatus = (id: string, status: string) => {
    setDeployments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status } : d)),
    );
    if (activeIdRef.current === id)
      setActiveDeployment((prev) => (prev ? { ...prev, status } : null));
  };

  const updateDeploymentUrl = (id: string, url: string) => {
    setDeployments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, url } : d)),
    );
    if (activeIdRef.current === id) {
      setActiveDeployment((prev) => (prev ? { ...prev, url } : null));
    }
  };

  const clearProjectCaches = () => {
    localStorage.removeItem(`${CACHE_KEY_PREFIX}${projectId}`);
    localStorage.removeItem("hatch_projects_cache");
    localStorage.removeItem("hatch_insights_cache");
  };

  const handleCopyLogs = async () => {
    if (logs.length === 0 || copied) return;
    try {
      await navigator.clipboard.writeText(logs.map((l) => l.text).join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice({
        type: "error",
        title: "Copy failed",
        message: "Your browser blocked clipboard access.",
      });
    }
  };

  const handleDeploy = async () => {
    if (!project || deploying) return;
    setDeploying(true);
    try {
      const res = await apiFetch("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          branch: activeDeployment?.branch || project.branch || "main",
          port: Number(activeDeployment?.port || project.port || 80),
          health_check: activeDeployment?.health_check || "/",
        }),
      });
      if (redirectIfUnauthorized(res, navigate)) return;
      if (res.ok) {
        const newDep = await res.json();
        setDeployments((prev) => [newDep, ...prev]);
        setActiveDeployment(newDep);
        setLogs([]);
        clearProjectCaches();
        setNotice({
          type: "success",
          title: "Deployment queued",
          message: "Live logs will stream here as the build starts.",
        });
      } else {
        setNotice({
          type: "error",
          title: "Deploy failed to start",
          message: await readApiError(res, "The deployment could not be queued."),
        });
      }
    } catch {
      setNotice({
        type: "error",
        title: "Deploy request failed",
        message: "We couldn't reach the API to start a deployment.",
      });
    } finally {
      setDeploying(false);
    }
  };

  const handleCancelDeployment = async () => {
    if (!activeDeployment || canceling) return;
    if (!confirm("Cancel this deployment?")) return;

    setCanceling(true);
    try {
      const res = await apiFetch(
        `/api/deployments/${activeDeployment.id}/cancel`,
        { method: "POST" },
      );
      if (redirectIfUnauthorized(res, navigate)) return;
      if (!res.ok) {
        setNotice({
          type: "error",
          title: "Cancel failed",
          message: await readApiError(
            res,
            "This deployment can no longer be canceled.",
          ),
        });
        return;
      }

      const canceled = await res.json();
      setDeployments((prev) =>
        prev.map((d) => (d.id === canceled.id ? canceled : d)),
      );
      setActiveDeployment(canceled);
      setLogs((prev) => [...prev, parseLogLine("Deployment canceled by user")]);
      wsRef.current?.close();
      clearProjectCaches();
      setNotice({
        type: "success",
        title: "Deployment canceled",
        message: "Provisioning has been stopped for this run.",
      });
    } finally {
      setCanceling(false);
    }
  };

  if (!mounted) return <PageLoadingState />;

  const activeStatus = activeDeployment?.status?.toLowerCase() ?? "";
  const isLive = activeStatus === "live";
  const isBuilding = ["building", "deploying", "queued"].includes(
    activeStatus,
  );
  const isCancelable = ["building", "deploying", "queued"].includes(
    activeStatus,
  );
  const liveUrl = isLive ? deploymentUrl(activeDeployment?.url) : null;

  const selectedRepoLabel =
    project?.repo_url.replace("https://github.com/", "") ?? "Repository";
  const statusTone = getStatusTone(activeDeployment?.status);

  return (
    <AppShell
      className="xl:h-[calc(100vh-64px)] xl:overflow-hidden"
      contentClassName="xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:py-5"
    >
      <NoticeToast notice={notice} onDismiss={() => setNotice(null)} />
      <PageTitle
        eyebrow="Service"
        title={loading ? "Loading..." : project?.repo_name || "Service"}
        description={selectedRepoLabel}
        className="xl:mb-5 xl:pb-5"
        actions={
          <>
            <Button variant="ghost" href="/console">
              Back
            </Button>
            {liveUrl && (
              <Button href={liveUrl} variant="secondary">
                Open
              </Button>
            )}
            <Button href={`/projects/${projectId}/settings`} variant="secondary">
              Settings
            </Button>
            <Button
              variant="primary"
              onClick={handleDeploy}
              disabled={deploying || canceling}
            >
              {deploying ? "Deploying..." : "Deploy"}
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 overflow-hidden rounded-md border border-white/[0.09] bg-[#080808] sm:grid-cols-4 xl:mb-5 xl:shrink-0">
        <ServiceMetric
          label="Status"
          value={activeDeployment?.status || "Idle"}
          tone={statusTone}
          status
          pulse={isBuilding}
        />
        <ServiceMetric
          label="Branch"
          value={activeDeployment?.branch || project?.branch || "-"}
          mono
        />
        <ServiceMetric
          label="Last updated"
          value={
            activeDeployment
              ? formatRelativeTime(
                  activeDeployment.deployed_at ||
                    activeDeployment.created_at,
                )
              : "Never"
          }
        />
        <ServiceMetric
          label="Deployments"
          value={String(deployments.length)}
        />
      </div>

      <main className="grid grid-cols-1 gap-5 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_370px]">
        <section className="min-w-0 xl:min-h-0">
          <LogPanel
            activeDeployment={activeDeployment}
            logs={logs}
            isBuilding={isBuilding}
            copied={copied}
            onCopyLogs={handleCopyLogs}
            logsEndRef={logsEndRef}
          />
        </section>

        <aside className="min-w-0 space-y-5 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <CurrentRunPanel
            activeDeployment={activeDeployment}
            project={project}
            liveUrl={liveUrl}
            isBuilding={isBuilding}
            isCancelable={isCancelable}
            canceling={canceling}
            onCancel={handleCancelDeployment}
          />

          <ActionPanel
            project={project}
            projectId={projectId}
            deploying={deploying}
            canceling={canceling}
            onDeploy={handleDeploy}
          />

          <HistoryPanel
            loading={loading}
            deployments={deployments}
            activeDeployment={activeDeployment}
            projectId={projectId}
            onSelectDeployment={setActiveDeployment}
          />
        </aside>
      </main>
    </AppShell>
  );
}

function CurrentRunPanel({
  activeDeployment,
  project,
  liveUrl,
  isBuilding,
  isCancelable,
  canceling,
  onCancel,
}: {
  activeDeployment: Deployment | null;
  project: Project | null;
  liveUrl: string | null;
  isBuilding: boolean;
  isCancelable: boolean;
  canceling: boolean;
  onCancel: () => void;
}) {
  return (
    <Panel
      title="Current deployment"
      meta={activeDeployment?.id.slice(0, 8) || "none"}
    >
      {activeDeployment ? (
        <div>
          <div className="flex items-center justify-between gap-4">
            <StatusText
              tone={getStatusTone(activeDeployment.status)}
              pulse={isBuilding}
            >
              {activeDeployment.status}
            </StatusText>
            {isCancelable && (
              <Button variant="danger" onClick={onCancel} disabled={canceling}>
                {canceling ? "Canceling" : "Cancel"}
              </Button>
            )}
          </div>

          {liveUrl && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex min-w-0 items-center justify-between gap-3 rounded-md border border-white/[0.09] bg-black/40 px-3 py-2.5 text-[11px] text-zinc-400 transition-colors hover:border-white/20 hover:text-white"
            >
              <span className="truncate font-mono">
                {liveUrl.replace(/^https?:\/\//, "")}
              </span>
              <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-700">
                Open
              </span>
            </a>
          )}

          <div className="mt-5 divide-y divide-white/[0.065] border-y border-white/[0.065]">
            <DetailRow label="Branch" value={activeDeployment.branch} mono />
            <DetailRow label="Port" value={String(activeDeployment.port)} />
            <DetailRow
              label="Dockerfile"
              value={project?.dockerfile_path || "Dockerfile"}
              mono
            />
            <DetailRow
              label="Health check"
              value={activeDeployment.health_check || "/"}
              mono
            />
            <DetailRow
              label="Created"
              value={formatRelativeTime(activeDeployment.created_at)}
            />
          </div>
        </div>
      ) : (
        <div className="py-2">
          <p className="text-sm leading-6 text-zinc-600">
            No deployments have been created for this service yet.
          </p>
        </div>
      )}
    </Panel>
  );
}

function ActionPanel({
  project,
  projectId,
  deploying,
  canceling,
  onDeploy,
}: {
  project: Project | null;
  projectId: string;
  deploying: boolean;
  canceling: boolean;
  onDeploy: () => void;
}) {
  return (
    <Panel
      title="Quick actions"
      meta={project?.auto_deploy ? "auto-deploy on" : "manual"}
    >
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          onClick={onDeploy}
          disabled={deploying || canceling}
          className="w-full"
        >
          {deploying ? "Deploying" : "Deploy"}
        </Button>
        <Button
          href={`/projects/${projectId}/settings`}
          variant="secondary"
          className="w-full"
        >
          Configure
        </Button>
      </div>
    </Panel>
  );
}

function HistoryPanel({
  loading,
  deployments,
  activeDeployment,
  projectId,
  onSelectDeployment,
}: {
  loading: boolean;
  deployments: Deployment[];
  activeDeployment: Deployment | null;
  projectId: string;
  onSelectDeployment: (deployment: Deployment) => void;
}) {
  return (
    <Panel title="Deployment history" meta={`${deployments.length} runs`}>
      {loading ? (
        <div className="space-y-4 py-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-2 opacity-70">
              <div className="h-2 w-20 animate-pulse rounded-full bg-zinc-900" />
              <div className="h-2 w-32 animate-pulse rounded-full bg-zinc-900/70" />
            </div>
          ))}
        </div>
      ) : deployments.length === 0 ? (
        <p className="py-2 text-sm text-zinc-700">No deployments yet.</p>
      ) : (
        <div className="-mx-4 max-h-[330px] overflow-y-auto">
          {deployments.map((deployment, index) => {
            const isActive = activeDeployment?.id === deployment.id;
            const isRunning = ["building", "deploying", "queued"].includes(
              deployment.status.toLowerCase(),
            );

            return (
              <div
                key={deployment.id}
                className={cn(
                  "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-white/[0.055] px-4 py-3 transition-colors first:border-t-0",
                  isActive
                    ? "bg-white/[0.045]"
                    : "hover:bg-white/[0.025]",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectDeployment(deployment)}
                  className="min-w-0 cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2">
                    <StatusText
                      tone={getStatusTone(deployment.status)}
                      pulse={isRunning}
                    >
                      {deployment.status}
                    </StatusText>
                    {index === 0 && (
                      <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-700">
                        latest
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex min-w-0 items-center gap-2 font-mono text-[10px] text-zinc-700">
                    <span>{deployment.id.slice(0, 8)}</span>
                    <span className="text-zinc-800">/</span>
                    <span className="truncate">{deployment.branch}</span>
                    <span className="ml-auto shrink-0">
                      {formatRelativeTime(deployment.created_at)}
                    </span>
                  </div>
                  {deployment.commit_message && (
                    <p className="mt-1 truncate text-[10px] text-zinc-700">
                      {deployment.commit_message}
                    </p>
                  )}
                </button>
                <Link
                  to={`/projects/${projectId}/deployments/${deployment.id}`}
                  className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-700 transition-colors group-hover:text-zinc-500 hover:!text-white"
                >
                  View
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function Panel({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-white/[0.09] bg-[#080808]">
      <div className="flex min-h-12 items-center justify-between gap-4 border-b border-white/[0.08] px-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          {title}
        </h3>
        {meta && (
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-700">
            {meta}
          </span>
        )}
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function ServiceMetric({
  label,
  value,
  tone = "default",
  mono = false,
  status = false,
  pulse = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger" | "muted";
  mono?: boolean;
  status?: boolean;
  pulse?: boolean;
}) {
  const color = {
    default: "text-zinc-200",
    success: "text-[#5cc98f]",
    warning: "text-[#d8ad4f]",
    danger: "text-[#d86666]",
    muted: "text-zinc-500",
  } satisfies Record<typeof tone, string>;

  return (
    <div className="min-w-0 border-b border-r border-white/[0.07] px-4 py-4 even:border-r-0 [&:nth-child(3)]:border-b-0 [&:nth-child(4)]:border-b-0 sm:border-b-0 sm:even:border-r sm:last:border-r-0">
      <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.17em] text-zinc-700">
        {label}
      </p>
      {status ? (
        <StatusText tone={tone} pulse={pulse}>
          {value}
        </StatusText>
      ) : (
        <p
          className={cn(
            "truncate text-[13px] font-medium",
            mono && "font-mono text-[12px]",
            color[tone],
          )}
        >
          {value}
        </p>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-5">
      <span className="text-[11px] text-zinc-600">{label}</span>
      <span
        className={cn(
          "max-w-[62%] truncate text-right text-[11px] text-zinc-300",
          mono && "font-mono",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function LogPanel({
  activeDeployment,
  logs,
  isBuilding,
  copied,
  onCopyLogs,
  logsEndRef,
}: {
  activeDeployment: Deployment | null;
  logs: LogLine[];
  isBuilding: boolean;
  copied: boolean;
  onCopyLogs: () => void;
  logsEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-white/[0.09] bg-[#070707] xl:flex xl:h-full xl:min-h-0 xl:flex-col">
      <div className="flex flex-col gap-4 border-b border-white/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between xl:shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-white">
              Deployment logs
            </h2>
            {activeDeployment && (
              <StatusText
                tone={getStatusTone(activeDeployment.status)}
                pulse={isBuilding}
              >
                {activeDeployment.status}
              </StatusText>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-700">
              {activeDeployment
                ? `deploy/${activeDeployment.id.slice(0, 8)}`
                : "No deployment"}
            </span>
            <span className="font-mono text-[10px] text-zinc-700">
              {logs.length} line{logs.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isBuilding && <ActivityDots />}
          <Button
            variant="ghost"
            onClick={onCopyLogs}
            disabled={logs.length === 0}
          >
            {copied ? "Copied" : "Copy Logs"}
          </Button>
        </div>
      </div>

      <div className="h-[580px] min-h-[420px] overflow-y-auto px-3 py-4 font-mono xl:h-auto xl:min-h-0 xl:flex-1">
        {logs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-700">
              {isBuilding ? "Waiting for output" : "No log output"}
            </p>
            {!isBuilding && activeDeployment && (
              <p className="text-xs text-zinc-700">
                Logs may not be available for older deployments.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-px">
            {logs.map((log, index) => (
              <div
                key={`${log.timestamp}-${index}`}
                className="grid grid-cols-[70px_minmax(0,1fr)] gap-4 rounded-md px-2 py-1.5 transition-colors hover:bg-white/[0.025]"
              >
                <span className="select-none pt-px text-[10px] tabular-nums text-zinc-800">
                  {log.timestamp}
                </span>
                <p
                  className={`break-words text-[12px] leading-relaxed ${getLogTypeColor(log.type)}`}
                >
                  {renderLogText(log.text)}
                </p>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </section>
  );
}

function ActivityDots() {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1 w-1 rounded-full bg-[#d8ad4f] animate-pulse"
          style={{ animationDelay: `${index * 150}ms` }}
        />
      ))}
    </div>
  );
}

function getStatusTone(
  status?: string | null,
): "default" | "success" | "warning" | "danger" | "muted" {
  const value = status?.toLowerCase();
  if (value === "live") return "success";
  if (value && ["building", "deploying", "queued"].includes(value)) {
    return "warning";
  }
  if (value && ["failed", "error"].includes(value)) return "danger";
  if (value === "canceled") return "muted";
  return "default";
}

function statusFromLogLine(line: string): string | null {
  const lower = line.toLowerCase();

  if (
    lower.includes("deployment live at") ||
    lower.includes("target healthy") ||
    lower.includes("build complete")
  ) {
    return "live";
  }

  if (lower.includes("deployment canceled")) {
    return "canceled";
  }

  if (lower.includes("deployment failed") || lower.includes("error:")) {
    return "failed";
  }

  if (
    lower.includes("handoff to deployer") ||
    lower.includes("triggering deployment orchestration") ||
    lower.includes("registering task definition") ||
    lower.includes("configuring target group") ||
    lower.includes("updating routing rules") ||
    lower.includes("provisioning fargate") ||
    lower.includes("monitoring service stability") ||
    lower.includes("task health")
  ) {
    return "deploying";
  }

  if (
    lower.includes("syncing source") ||
    lower.includes("starting docker build") ||
    lower.includes("authenticating with amazon ecr") ||
    lower.includes("pushing image") ||
    lower.includes("image successfully pushed")
  ) {
    return "building";
  }

  return null;
}

function deploymentUrlFromLogLine(line: string): string | null {
  if (!line.toLowerCase().includes("deployment live at")) return null;
  return line.match(/https?:\/\/[^\s]+/)?.[0] ?? null;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function renderLogText(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    part.match(urlRegex) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#74c69d] underline underline-offset-3 decoration-[#74c69d]/30 hover:decoration-[#74c69d] transition-all"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function getLogTypeColor(type: string): string {
  switch (type) {
    case "success":
      return "text-[#74c69d]";
    case "error":
      return "text-[#c56b6b]";
    case "system":
      return "text-zinc-500 font-bold";
    default:
      return "text-zinc-600";
  }
}
