import { useNavigate, useParams } from "react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageLoadingState } from "@/components/LoadingState";
import {
  apiFetch,
  deploymentUrl,
  productionHost,
  readApiError,
  redirectIfUnauthorized,
} from "@/lib/api";
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

interface Deployment {
  id: string;
  project_id: string;
  branch: string;
  status: string;
  port: number;
  health_check: string;
  image_uri: string | null;
  ecs_task_arn: string | null;
  ecs_service_name: string | null;
  target_group_arn: string | null;
  subdomain: string | null;
  url: string | null;
  commit_sha: string | null;
  commit_message: string | null;
  created_at: string;
  deployed_at: string | null;
}

interface Project {
  id: string;
  repo_name: string;
  repo_url: string;
  branch: string;
  dockerfile_path: string;
  subdomain: { String?: string; Valid?: boolean } | string | null;
}

interface LogLine {
  text: string;
  timestamp?: string;
}

type DeploymentTone = "default" | "success" | "warning" | "danger" | "muted";

const CACHE_KEY_PREFIX = "hatch_deployment_";
const CACHE_TTL = 90 * 1000;
const PIPELINE_STEPS = [
  { key: "queued", label: "Queued" },
  { key: "building", label: "Building" },
  { key: "deploying", label: "Deploying" },
  { key: "live", label: "Live" },
];

export default function DeploymentDetailClient() {
  const { id, deploymentId } = useParams<{ id: string; deploymentId: string }>();
  const navigate = useNavigate();
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [notice, setNotice] = useState<NoticePayload | null>(null);

  const loadDeployment = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      if (!quiet) setLoading(true);
      const cacheKey = `${CACHE_KEY_PREFIX}${deploymentId}`;

      if (!quiet) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Date.now() - (parsed.timestamp || 0) < CACHE_TTL) {
              setDeployment(parsed.deployment);
              setProject(parsed.project ?? null);
              setLogs(parsed.logs ?? []);
              setLoading(false);
            }
          } catch {
            // A corrupt cache entry is ignored.
          }
        }
      }

      try {
        const [deploymentRes, projectRes, logsRes] = await Promise.all([
          apiFetch(`/api/deployments/${deploymentId}`),
          apiFetch(`/api/projects/${id}`),
          apiFetch(`/api/deployments/${deploymentId}/logs`),
        ]);

        if (
          redirectIfUnauthorized(deploymentRes, navigate) ||
          redirectIfUnauthorized(projectRes, navigate) ||
          redirectIfUnauthorized(logsRes, navigate)
        ) {
          return;
        }
        if (!deploymentRes.ok) {
          throw new Error(await readApiError(deploymentRes, "deployment not found"));
        }

        const nextDeployment: Deployment = await deploymentRes.json();
        const nextProject: Project | null = projectRes.ok
          ? await projectRes.json()
          : null;
        const nextLogs: LogLine[] = logsRes.ok
          ? (await logsRes.json()).map((line: string) => ({ text: line }))
          : [];

        setDeployment(nextDeployment);
        setProject(nextProject);
        setLogs(nextLogs);
        localStorage.setItem(
          cacheKey,
          JSON.stringify({
            deployment: nextDeployment,
            project: nextProject,
            logs: nextLogs.slice(-40),
            timestamp: Date.now(),
          }),
        );
      } catch (err) {
        setNotice({
          type: "error",
          title: "Deployment unavailable",
          message:
            err instanceof Error
              ? err.message
              : "Hatch could not load this deployment.",
        });
      } finally {
        setLoading(false);
      }
    },
    [deploymentId, id, navigate],
  );

  useEffect(() => {
    loadDeployment();
  }, [loadDeployment]);

  useEffect(() => {
    if (!deployment || !isActiveStatus(deployment.status)) return;
    const interval = window.setInterval(() => {
      loadDeployment({ quiet: true });
    }, 3500);
    return () => window.clearInterval(interval);
  }, [deployment, loadDeployment]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const duration = useMemo(() => {
    if (!deployment?.created_at || !deployment?.deployed_at) return null;
    return Math.max(
      0,
      Math.round(
        (new Date(deployment.deployed_at).getTime() -
          new Date(deployment.created_at).getTime()) /
          1000,
      ),
    );
  }, [deployment?.created_at, deployment?.deployed_at]);

  const liveUrl = useMemo(() => {
    if (!deployment) return null;
    return deploymentUrl(
      deployment.url || productionHost(deployment.subdomain || subdomainValue(project?.subdomain)),
    );
  }, [deployment, project?.subdomain]);

  async function handleCancel() {
    if (!deployment || canceling || !isActiveStatus(deployment.status)) return;
    if (!confirm("Cancel this deployment?")) return;

    setCanceling(true);
    try {
      const res = await apiFetch(`/api/deployments/${deployment.id}/cancel`, {
        method: "POST",
      });
      if (redirectIfUnauthorized(res, navigate)) return;
      if (!res.ok) {
        throw new Error(await readApiError(res, "deployment cannot be canceled"));
      }
      const canceled: Deployment = await res.json();
      setDeployment(canceled);
      setLogs((prev) => [...prev, { text: "Deployment canceled by user" }]);
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${deploymentId}`);
      setNotice({
        type: "success",
        title: "Deployment canceled",
        message: "Provisioning has been stopped for this run.",
      });
    } catch (err) {
      setNotice({
        type: "error",
        title: "Cancel failed",
        message:
          err instanceof Error
            ? err.message
            : "This deployment could not be canceled.",
      });
    } finally {
      setCanceling(false);
    }
  }

  if (loading && !deployment) return <PageLoadingState />;

  if (!deployment) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-[#050505] text-zinc-600">
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-700">
            Deployment unavailable
          </p>
          <Button
            href={`/projects/${id}`}
            variant="secondary"
            className="mt-4"
          >
            Back to service
          </Button>
        </div>
      </div>
    );
  }

  const status = deployment.status.toLowerCase();
  const isLive = status === "live";
  const isFailed = status === "failed" || status === "error";
  const isCanceled = status === "canceled";
  const active = isActiveStatus(status);
  const pipelineIndex = getPipelineIndex(status);
  const recentLogs = logs.slice(-12);
  const shortDeploymentId = `${deployment.id.slice(0, 8)}...${deployment.id.slice(-4)}`;
  const commitLabel = deployment.commit_sha
    ? deployment.commit_sha.slice(0, 7)
    : deployment.branch;
  const resultLabel = isLive
    ? "Ready"
    : isFailed
      ? "Failed"
      : isCanceled
        ? "Canceled"
        : "In progress";
  const statusTone = deploymentStatusTone(status);

  return (
    <AppShell
      className="xl:h-[calc(100vh-64px)] xl:overflow-hidden"
      contentClassName="xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:py-5"
    >
      <NoticeToast notice={notice} onDismiss={() => setNotice(null)} />
      <PageTitle
        eyebrow="Deployment"
        title={project?.repo_name || "Deployment"}
        description={deployment.commit_message || `Run ${shortDeploymentId}`}
        className="xl:mb-5 xl:shrink-0 xl:pb-5"
        actions={
          <>
            <Button variant="ghost" href={`/projects/${id}`}>
              Back
            </Button>
            {liveUrl && (
              <Button
                href={liveUrl}
                variant="secondary"
              >
                Open
              </Button>
            )}
            {active && (
              <Button
                variant="danger"
                onClick={handleCancel}
                disabled={canceling}
              >
                {canceling ? "Canceling" : "Cancel"}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-7 grid grid-cols-2 gap-x-8 gap-y-4 border-b border-white/[0.08] pb-7 sm:flex sm:items-end sm:gap-12 xl:mb-5 xl:shrink-0 xl:pb-5">
        <SummaryMetric label="Status" value={resultLabel} tone={statusTone} />
        <SummaryMetric label="Deployment" value={shortDeploymentId} />
        <SummaryMetric label="Commit" value={commitLabel} />
        <SummaryMetric label="Duration" value={duration === null ? "-" : formatDuration(duration)} />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="min-w-0 space-y-7 pb-8">
            <HeroPanel
              deployment={deployment}
              project={project}
              resultLabel={resultLabel}
              statusTone={statusTone}
              active={active}
            />

            <PipelinePanel
              status={status}
              active={active}
              isFailed={isFailed}
              isCanceled={isCanceled}
              pipelineIndex={pipelineIndex}
              deployment={deployment}
            />

            <div className="grid gap-7 lg:grid-cols-2">
              <InfoCard title="Source">
                <Kv label="Repository" value={repoLabel(project?.repo_url)} />
                <Kv label="Branch" value={deployment.branch} />
                <Kv label="Commit" value={deployment.commit_sha ? deployment.commit_sha.slice(0, 7) : "-"} />
                <Kv label="Message" value={deployment.commit_message || "-"} wide />
              </InfoCard>

              <InfoCard title="Runtime">
                <Kv label="Port" value={`TCP/${deployment.port}`} />
                <Kv label="Health check" value={deployment.health_check || "/"} />
                <Kv label="Status" value={deployment.status} />
              </InfoCard>
            </div>

            <InfoCard title="Recent Logs">
              {recentLogs.length === 0 ? (
                <p className="font-mono text-sm text-zinc-700">
                  No log lines recorded for this deployment.
                </p>
              ) : (
                <div className="space-y-2">
                  {recentLogs.map((log, index) => (
                    <p
                      key={`${log.text}-${index}`}
                      className={`break-words font-mono text-xs leading-relaxed ${logColor(log.text)}`}
                    >
                      {log.text}
                    </p>
                  ))}
                </div>
              )}
            </InfoCard>
          </section>

          <aside className="space-y-7 pb-8">
            <InfoCard title="Deployment ID">
              <code className="block break-all font-mono text-sm leading-relaxed text-zinc-400">
                {deployment.id}
              </code>
              <div className="mt-5 space-y-3">
                <MiniKv label="Service" value={project?.repo_name || "-"} />
                <MiniKv label="Created" value={formatDateTime(deployment.created_at)} />
                <MiniKv label="Deployed" value={deployment.deployed_at ? formatDateTime(deployment.deployed_at) : "-"} />
              </div>
            </InfoCard>

            <InfoCard title="Network">
              <Kv label="Subdomain" value={deployment.subdomain || subdomainValue(project?.subdomain) || "-"} />
              <Kv
                label="URL"
                value={
                  liveUrl ? (
                    <a
                      href={liveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#5cc98f] hover:underline"
                    >
                      {liveUrl.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    "-"
                  )
                }
              />
              <Kv label="ECS service" value={deployment.ecs_service_name || "-"} />
              <Kv label="Target group" value={shortArn(deployment.target_group_arn)} />
            </InfoCard>

            <InfoCard title="Artifact">
              <Kv label="Image" value={deployment.image_uri || "No image recorded"} wide />
              <Kv label="Task ARN" value={shortArn(deployment.ecs_task_arn)} wide />
            </InfoCard>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-y border-white/[0.08] py-5">
      <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
        {title}
      </p>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function HeroPanel({
  deployment,
  project,
  resultLabel,
  statusTone,
  active,
}: {
  deployment: Deployment;
  project: Project | null;
  resultLabel: string;
  statusTone: DeploymentTone;
  active: boolean;
}) {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.018] p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <StatusText tone={statusTone} pulse={active}>
          {resultLabel}
        </StatusText>
        <span className="font-mono text-[10px] text-zinc-700">
          {formatDateTime(deployment.created_at)}
        </span>
      </div>
      <h2 className="max-w-4xl text-2xl font-medium leading-tight tracking-tight text-white sm:text-3xl">
        {deployment.commit_message ||
          `Deployment for ${project?.repo_name || "service"}`}
      </h2>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StaticMini label="Repository" value={repoLabel(project?.repo_url)} />
        <StaticMini label="Branch" value={deployment.branch} />
        <StaticMini
          label="Commit"
          value={deployment.commit_sha ? deployment.commit_sha.slice(0, 7) : "-"}
        />
      </div>
    </section>
  );
}

function PipelinePanel({
  active,
  isFailed,
  isCanceled,
  pipelineIndex,
  deployment,
}: {
  status: string;
  active: boolean;
  isFailed: boolean;
  isCanceled: boolean;
  pipelineIndex: number;
  deployment: Deployment;
}) {
  return (
    <section className="grid overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.018] lg:grid-cols-4">
      {PIPELINE_STEPS.map((step, index) => {
        const done = !isFailed && !isCanceled && pipelineIndex >= index;
        const current = active && pipelineIndex === index;
        const terminalProblem =
          (isFailed || isCanceled) && index === Math.max(pipelineIndex, 0);
        const tone = terminalProblem
          ? "danger"
          : current
            ? "warning"
            : done
              ? "success"
              : "muted";
        return (
          <div
            key={step.key}
            className="border-b border-white/[0.08] p-5 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0"
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                Step {String(index + 1).padStart(2, "0")}
              </p>
              <StatusText tone={tone} pulse={current}>
                {terminalProblem ? "stopped" : done ? "done" : current ? "now" : "wait"}
              </StatusText>
            </div>
            <p
              className={cn(
                "text-base font-medium",
                done && "text-white",
                current && "text-[#d8ad4f]",
                terminalProblem && "text-[#d86666]",
                !done && !current && !terminalProblem && "text-zinc-700",
              )}
            >
              {step.label}
            </p>
            <p className="mt-2 font-mono text-[10px] text-zinc-700">
              {step.key === "queued"
                ? formatTime(deployment.created_at)
                : step.key === "live" && deployment.deployed_at
                  ? formatTime(deployment.deployed_at)
                  : done
                    ? "completed"
                    : current
                      ? "in progress"
                      : "pending"}
            </p>
          </div>
        );
      })}
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: DeploymentTone;
}) {
  const colors = {
    default: "text-white",
    success: "text-[#5cc98f]",
    warning: "text-[#d8ad4f]",
    danger: "text-[#d86666]",
    muted: "text-zinc-500",
  } satisfies Record<DeploymentTone, string>;

  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
        {label}
      </p>
      <p className={cn("truncate font-mono text-sm", colors[tone])}>{value}</p>
    </div>
  );
}

function MiniKv({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
        {label}
      </span>
      <span className="truncate text-right font-mono text-xs text-zinc-500">
        {value}
      </span>
    </div>
  );
}

function StaticMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/[0.08] bg-black px-4 py-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
        {label}
      </p>
      <p className="truncate font-mono text-sm text-zinc-400">{value}</p>
    </div>
  );
}

function Kv({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`grid gap-3 ${wide ? "grid-cols-1" : "grid-cols-[120px_minmax(0,1fr)]"}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
        {label}
      </span>
      <span className="min-w-0 truncate text-right font-mono text-xs text-zinc-500">
        {value}
      </span>
    </div>
  );
}

function getPipelineIndex(status: string): number {
  const s = status.toLowerCase();
  if (s === "queued") return 0;
  if (s === "building") return 1;
  if (s === "deploying") return 2;
  if (s === "live") return 3;
  if (s === "failed" || s === "error" || s === "canceled") return 2;
  return -1;
}

function isActiveStatus(status: string) {
  return ["queued", "building", "deploying"].includes(status.toLowerCase());
}

function deploymentStatusTone(status: string): DeploymentTone {
  const s = status.toLowerCase();
  if (s === "live") return "success";
  if (isActiveStatus(s)) return "warning";
  if (s === "failed" || s === "error") return "danger";
  if (s === "canceled") return "muted";
  return "default";
}

function logColor(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("failed") || lower.includes("error")) return "text-[#d86666]";
  if (lower.includes("success") || lower.includes("live at") || lower.includes("healthy")) {
    return "text-[#5cc98f]";
  }
  return "text-zinc-600";
}

function subdomainValue(subdomain?: Project["subdomain"]) {
  if (!subdomain) return null;
  if (typeof subdomain === "string") return subdomain;
  if (subdomain.Valid && subdomain.String) return subdomain.String;
  return null;
}

function repoLabel(repoUrl?: string) {
  if (!repoUrl) return "-";
  return repoUrl.replace(/^https:\/\/github.com\//, "");
}

function shortArn(value?: string | null) {
  if (!value) return "-";
  const parts = value.split("/");
  return parts.slice(-2).join("/");
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
