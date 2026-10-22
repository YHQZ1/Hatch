import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { NoticeToast } from "@/components/NoticeToast";
import { AppShell, Button, PageTitle, StatusText } from "@/components/ui";
import { useNotice } from "@/components/useNotice";
import {
  apiFetch,
  apiJson,
  deploymentUrl,
  readApiError,
  redirectIfUnauthorized,
  websocketUrl,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { safeHttpUrl } from "@/lib/url";
import {
  ACTIVE_DEPLOYMENT_STATUSES,
  NO_DEPLOYMENTS,
  activityQuery,
  projectDeploymentsQuery,
  projectQuery,
  projectsQuery,
} from "@/lib/queries";
import type { Deployment, Project } from "@/lib/types";

interface LogLine {
  text: string;
  type: "info" | "success" | "error" | "muted" | "system";
  timestamp: string;
}

const EMPTY_LOGS: LogLine[] = [];
const TERMINAL_STATUSES = new Set(["live", "failed", "canceled"]);

export default function ProjectDetail() {
  const { id: projectId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const projectResult = useQuery(projectQuery(projectId));
  const deploymentsResult = useQuery(projectDeploymentsQuery(projectId));
  const project = projectResult.data ?? null;
  const deployments = deploymentsResult.data ?? NO_DEPLOYMENTS;
  const loading = projectResult.isPending || deploymentsResult.isPending;

  // The deployment being viewed: the one the user picked, else the latest.
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<
    string | null
  >(null);
  const activeDeployment =
    deployments.find((deployment) => deployment.id === selectedDeploymentId) ??
    deployments[0] ??
    null;
  const activeId = activeDeployment?.id ?? null;

  const [logsById, setLogsById] = useState<Record<string, LogLine[]>>({});
  const logs = (activeId && logsById[activeId]) || EMPTY_LOGS;
  const [deploying, setDeploying] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [copied, setCopied] = useState(false);

  const failedAt = projectResult.isError
    ? projectResult.errorUpdatedAt
    : deploymentsResult.isError
      ? deploymentsResult.errorUpdatedAt
      : null;
  const { notice, setNotice, dismiss } = useNotice(
    {
      failedAt,
      notice: {
        type: "error",
        title: "Project unavailable",
        message: "We couldn't load the latest project state.",
      },
    },
    { showFlash: true },
  );

  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  // Streams a deployment's logs while it is in progress, and loads them once
  // otherwise. Only the deployment viewed matters here, not its later status
  // changes, so the status is read from the query cache when this starts.
  useEffect(() => {
    if (!activeId) return;
    const deploymentsKey = projectDeploymentsQuery(projectId).queryKey;
    const status = queryClient
      .getQueryData<Deployment[]>(deploymentsKey)
      ?.find((deployment) => deployment.id === activeId)
      ?.status.toLowerCase();

    if (ACTIVE_DEPLOYMENT_STATUSES.has(status ?? "")) {
      const ws = new WebSocket(websocketUrl(`/ws/deployments/${activeId}`));
      wsRef.current = ws;
      ws.onopen = () => {
        setLogsById((prev) => ({ ...prev, [activeId]: [] }));
        ws.send("READY");
      };
      ws.onmessage = (event) => {
        const line = String(event.data);
        if (line === "READY") return;
        setLogsById((prev) => ({
          ...prev,
          [activeId]: [...(prev[activeId] ?? []), parseLogLine(line)],
        }));

        // Show the stage right away; the API stays the source of truth.
        const nextStatus = statusFromLogLine(line);
        if (!nextStatus) return;
        queryClient.setQueryData<Deployment[]>(deploymentsKey, (current) =>
          current?.map((deployment) =>
            deployment.id === activeId
              ? { ...deployment, status: nextStatus }
              : deployment,
          ),
        );
        if (TERMINAL_STATUSES.has(nextStatus)) {
          ws.close();
          void queryClient.invalidateQueries({ queryKey: deploymentsKey });
        }
      };
      return () => ws.close();
    }

    let cancelled = false;
    apiJson<string[] | null>(`/api/deployments/${activeId}/logs`)
      .then((history) => {
        if (cancelled || !Array.isArray(history)) return;
        setLogsById((prev) => ({ ...prev, [activeId]: history.map(parseLogLine) }));
      })
      .catch(() => {
        // The panel stays empty if the history cannot be loaded.
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, projectId, queryClient]);

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
        const newDeployment = (await res.json()) as Deployment;
        queryClient.setQueryData<Deployment[]>(
          projectDeploymentsQuery(projectId).queryKey,
          (current) => [newDeployment, ...(current ?? [])],
        );
        void queryClient.invalidateQueries({
          queryKey: projectsQuery().queryKey,
          exact: true,
        });
        void queryClient.invalidateQueries({ queryKey: activityQuery().queryKey });
        setSelectedDeploymentId(newDeployment.id);
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

      const canceled = (await res.json()) as Deployment;
      queryClient.setQueryData<Deployment[]>(
        projectDeploymentsQuery(projectId).queryKey,
        (current) =>
          current?.map((deployment) =>
            deployment.id === canceled.id ? canceled : deployment,
          ),
      );
      void queryClient.invalidateQueries({
        queryKey: projectsQuery().queryKey,
        exact: true,
      });
      void queryClient.invalidateQueries({ queryKey: activityQuery().queryKey });
      setSelectedDeploymentId(canceled.id);
      setLogsById((prev) => ({
        ...prev,
        [canceled.id]: [
          ...(prev[canceled.id] ?? []),
          parseLogLine("Deployment canceled by user"),
        ],
      }));
      wsRef.current?.close();
      setNotice({
        type: "success",
        title: "Deployment canceled",
        message: "Provisioning has been stopped for this run.",
      });
    } finally {
      setCanceling(false);
    }
  };

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
      <NoticeToast notice={notice} onDismiss={dismiss} />
      <PageTitle
        eyebrow="Project"
        title={loading ? "Loading..." : project?.repo_name || "Project"}
        description={selectedRepoLabel}
        className="xl:mb-5 xl:pb-5"
        actions={
          <>
            <Button variant="ghost" href="/overview">
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

      <div className="mb-6 grid grid-cols-2 overflow-hidden rounded-hatch border border-line bg-base sm:grid-cols-4 xl:mb-5 xl:shrink-0">
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
            onSelectDeployment={(deployment) => setSelectedDeploymentId(deployment.id)}
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
              className="mt-4 flex min-w-0 items-center justify-between gap-3 rounded-hatch border border-line bg-base/40 px-3 py-2.5 text-[11px] text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              <span className="truncate font-mono">
                {liveUrl.replace(/^https?:\/\//, "")}
              </span>
              <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
                Open
              </span>
            </a>
          )}

          <div className="mt-5 divide-y divide-line border-y border-line">
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
          <p className="text-sm leading-6 text-faint">
            No deployments have been created for this project yet.
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
              <div className="h-2 w-20 animate-pulse rounded-full bg-line" />
              <div className="h-2 w-32 animate-pulse rounded-full bg-line/70" />
            </div>
          ))}
        </div>
      ) : deployments.length === 0 ? (
        <p className="py-2 text-sm text-faint">No deployments yet.</p>
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
                  "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-line px-4 py-3 transition-colors first:border-t-0",
                  isActive
                    ? "bg-ink/[0.045]"
                    : "hover:bg-ink/[0.025]",
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
                      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
                        latest
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex min-w-0 items-center gap-2 font-mono text-[11px] text-faint">
                    <span>{deployment.id.slice(0, 8)}</span>
                    <span className="text-faint">/</span>
                    <span className="truncate">{deployment.branch}</span>
                    <span className="ml-auto shrink-0">
                      {formatRelativeTime(deployment.created_at)}
                    </span>
                  </div>
                  {deployment.commit_message && (
                    <p className="mt-1 truncate text-[11px] text-faint">
                      {deployment.commit_message}
                    </p>
                  )}
                </button>
                <Link
                  to={`/projects/${projectId}/deployments/${deployment.id}`}
                  className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint transition-colors group-hover:text-muted hover:!text-ink"
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
    <section className="overflow-hidden rounded-hatch border border-line bg-base">
      <div className="flex min-h-12 items-center justify-between gap-4 border-b border-line px-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          {title}
        </h3>
        {meta && (
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
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
    default: "text-ink",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    muted: "text-muted",
  } satisfies Record<typeof tone, string>;

  return (
    <div className="min-w-0 border-b border-r border-line px-4 py-4 even:border-r-0 [&:nth-child(3)]:border-b-0 [&:nth-child(4)]:border-b-0 sm:border-b-0 sm:even:border-r sm:last:border-r-0">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.17em] text-faint">
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
      <span className="text-[11px] text-faint">{label}</span>
      <span
        className={cn(
          "max-w-[62%] truncate text-right text-[11px] text-ink",
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
    <section className="overflow-hidden rounded-hatch border border-line bg-base xl:flex xl:h-full xl:min-h-0 xl:flex-col">
      <div className="flex flex-col gap-4 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between xl:shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-ink">
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
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
              {activeDeployment
                ? `deploy/${activeDeployment.id.slice(0, 8)}`
                : "No deployment"}
            </span>
            <span className="font-mono text-[11px] text-faint">
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
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-faint">
              {isBuilding ? "Waiting for output" : "No log output"}
            </p>
            {!isBuilding && activeDeployment && (
              <p className="text-xs text-faint">
                Logs may not be available for older deployments.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-px">
            {logs.map((log, index) => (
              <div
                key={`${log.timestamp}-${index}`}
                className="grid grid-cols-[70px_minmax(0,1fr)] gap-4 rounded-hatch px-2 py-1.5 transition-colors hover:bg-ink/[0.025]"
              >
                <span className="select-none pt-px text-[11px] tabular-nums text-faint">
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
          className="h-1 w-1 rounded-full bg-warning animate-pulse"
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

function parseLogLine(line: string): LogLine {
  const lower = line.toLowerCase();
  const isSuccess =
    line.includes("✓") ||
    line.includes("successfully") ||
    lower.includes("deployment live at") ||
    lower.includes("target healthy");
  const isError =
    line.includes("✗") || lower.includes("error") || lower.includes("failed");
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
  return parts.map((part, i) => {
    const href = part.match(urlRegex) ? safeHttpUrl(part) : null;
    return href ? (
      <a
        key={i}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-success underline underline-offset-3 decoration-success/30 hover:decoration-success transition-all"
      >
        {part}
      </a>
    ) : (
      part
    );
  });
}

function getLogTypeColor(type: string): string {
  switch (type) {
    case "success":
      return "text-success";
    case "error":
      return "text-danger";
    case "system":
      return "text-muted font-bold";
    default:
      return "text-faint";
  }
}
