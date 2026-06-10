"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageLoadingState } from "../../../../../../components/LoadingState";
import {
  apiFetch,
  deploymentUrl,
  readApiError,
  redirectIfUnauthorized,
} from "@/app/lib/api";

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

interface Notice {
  type: "success" | "error" | "info";
  title: string;
  message?: string;
}

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
  const router = useRouter();
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

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
          } catch {}
        }
      }

      try {
        const [deploymentRes, projectRes, logsRes] = await Promise.all([
          apiFetch(`/api/deployments/${deploymentId}`),
          apiFetch(`/api/projects/${id}`),
          apiFetch(`/api/deployments/${deploymentId}/logs`),
        ]);

        if (
          redirectIfUnauthorized(deploymentRes, router) ||
          redirectIfUnauthorized(projectRes, router) ||
          redirectIfUnauthorized(logsRes, router)
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
    [deploymentId, id, router],
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
      if (redirectIfUnauthorized(res, router)) return;
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
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-black text-zinc-600">
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-800">
            Deployment unavailable
          </p>
          <Link
            href={`/projects/${id}`}
            className="mt-4 inline-block text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 hover:text-zinc-200"
          >
            Back to service
          </Link>
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

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col overflow-hidden bg-black text-zinc-400">
      <DeploymentToast notice={notice} onDismiss={() => setNotice(null)} />

      <header className="shrink-0 border-b border-[#171717] bg-black px-5 py-3 md:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            href={`/projects/${id}`}
            className="group inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-700 transition-colors hover:text-zinc-400"
          >
            <span className="transition-transform group-hover:-translate-x-0.5">
              -
            </span>
            Back to service
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            {liveUrl && (
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-[#242424] px-4 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-200"
              >
                Open live URL
              </a>
            )}
            {active && (
              <button
                onClick={handleCancel}
                disabled={canceling}
                className="cursor-pointer border border-[#2a1515] px-4 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[#c56b6b] transition-colors hover:border-[#5a2525] hover:text-[#d88a8a] disabled:cursor-not-allowed disabled:opacity-30"
              >
                {canceling ? "Canceling" : "Cancel deployment"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-6 md:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="border border-[#181818] bg-[#030303]">
            <div className="grid gap-px bg-[#181818] lg:grid-cols-[1.35fr_0.65fr]">
              <div className="bg-[#030303] p-6 md:p-7">
                <div className="mb-6 flex flex-wrap items-center gap-3">
                  <span
                    className={`h-2 w-2 rounded-full ${statusDotColor(status)} ${active ? "animate-pulse" : ""}`}
                  />
                  <span
                    className={`text-[10px] font-bold uppercase tracking-[0.18em] ${statusTextColor(status)}`}
                  >
                    {resultLabel}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-800">
                    {formatDateTime(deployment.created_at)}
                  </span>
                </div>

                <h1 className="max-w-4xl text-[28px] font-semibold leading-tight tracking-tight text-zinc-100 md:text-[34px]">
                  {deployment.commit_message ||
                    `Deployment for ${project?.repo_name || "service"}`}
                </h1>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryMetric label="Deployment" value={shortDeploymentId} />
                  <SummaryMetric label="Commit" value={commitLabel} />
                  <SummaryMetric label="Branch" value={deployment.branch} />
                  <SummaryMetric
                    label="Duration"
                    value={duration === null ? "-" : formatDuration(duration)}
                  />
                </div>
              </div>

              <div className="bg-[#030303] p-6 md:p-7">
                <p className="mb-4 text-[9px] font-bold uppercase tracking-[0.22em] text-zinc-800">
                  Deployment ID
                </p>
                <code className="block break-all font-mono text-[12px] leading-relaxed text-zinc-400">
                  {deployment.id}
                </code>
                <div className="mt-6 space-y-3">
                  <MiniKv label="Service" value={project?.repo_name || "-"} />
                  <MiniKv label="Repository" value={repoLabel(project?.repo_url)} />
                  <MiniKv label="Created" value={formatDateTime(deployment.created_at)} />
                </div>
              </div>
            </div>
          </section>

          <section className="grid border border-[#181818] bg-[#030303] xl:grid-cols-4">
            {PIPELINE_STEPS.map((step, index) => {
              const done = !isFailed && !isCanceled && pipelineIndex >= index;
              const current = active && pipelineIndex === index;
              const terminalProblem =
                (isFailed || isCanceled) && index === Math.max(pipelineIndex, 0);
              return (
                <div
                  key={step.key}
                  className="border-b border-[#181818] p-5 xl:border-b-0 xl:border-r xl:last:border-r-0"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-[8px] font-bold uppercase tracking-[0.22em] text-zinc-800">
                      Step {String(index + 1).padStart(2, "0")}
                    </p>
                    <span className={`text-[10px] ${terminalProblem ? "text-[#c56b6b]" : done ? "text-zinc-300" : current ? "text-[#b8872f]" : "text-zinc-800"}`}>
                      {terminalProblem ? "x" : done ? "done" : current ? "now" : "-"}
                    </span>
                  </div>
                  <p className={`text-[15px] font-semibold ${done ? "text-zinc-100" : current ? "text-[#b8872f]" : terminalProblem ? "text-[#c56b6b]" : "text-zinc-700"}`}>
                    {step.label}
                  </p>
                  <p className="mt-2 font-mono text-[9px] text-zinc-800">
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

          <section className="grid gap-px overflow-hidden border border-[#181818] bg-[#181818] xl:grid-cols-[0.95fr_1.05fr_1.2fr]">
            <InfoCard title="Runtime">
              <Kv label="Port" value={`TCP/${deployment.port}`} />
              <Kv label="Health check" value={deployment.health_check || "/"} />
              <Kv label="Status" value={deployment.status} />
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
                      className="text-[#74c69d] hover:underline"
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
          </section>

          <section className="grid gap-px overflow-hidden border border-[#181818] bg-[#181818] xl:grid-cols-[0.75fr_1.25fr]">
            <InfoCard title="Source">
              <Kv label="Repository" value={repoLabel(project?.repo_url)} />
              <Kv label="Branch" value={deployment.branch} />
              <Kv label="Commit" value={deployment.commit_sha ? deployment.commit_sha.slice(0, 7) : "-"} />
              <Kv label="Message" value={deployment.commit_message || "-"} wide />
            </InfoCard>

            <InfoCard title="Recent logs">
              {recentLogs.length === 0 ? (
                <p className="font-mono text-[11px] text-zinc-700">
                  No log lines recorded for this deployment.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {recentLogs.map((log, index) => (
                    <p
                      key={`${log.text}-${index}`}
                      className={`break-words font-mono text-[10px] leading-relaxed ${logColor(log.text)}`}
                    >
                      {log.text}
                    </p>
                  ))}
                </div>
              )}
            </InfoCard>
          </section>
        </div>
      </main>
    </div>
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
    <div className="bg-[#030303] p-5">
      <p className="mb-5 text-[9px] font-bold uppercase tracking-[0.22em] text-zinc-800">
        {title}
      </p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#181818] bg-black px-4 py-3">
      <p className="mb-2 text-[8px] font-bold uppercase tracking-[0.18em] text-zinc-800">
        {label}
      </p>
      <p className="truncate font-mono text-[11px] text-zinc-400">{value}</p>
    </div>
  );
}

function MiniKv({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-zinc-800">
        {label}
      </span>
      <span className="truncate text-right font-mono text-[10px] text-zinc-600">
        {value}
      </span>
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
      <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-zinc-800">
        {label}
      </span>
      <span className="min-w-0 truncate text-right font-mono text-[10px] text-zinc-500">
        {value}
      </span>
    </div>
  );
}

function DeploymentToast({
  notice,
  onDismiss,
}: {
  notice: Notice | null;
  onDismiss: () => void;
}) {
  if (!notice) return null;
  const color =
    notice.type === "success"
      ? "text-[#74c69d]"
      : notice.type === "error"
        ? "text-[#c56b6b]"
        : "text-zinc-300";
  return (
    <div className="fixed right-5 top-[76px] z-50 w-[320px] border border-[#242424] bg-[#050505] px-4 py-3 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${color}`}>
            {notice.title}
          </p>
          {notice.message && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
              {notice.message}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="cursor-pointer text-[13px] leading-none text-zinc-700 transition-colors hover:text-zinc-300"
          aria-label="Dismiss notification"
        >
          x
        </button>
      </div>
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

function statusDotColor(status: string) {
  const s = status.toLowerCase();
  if (s === "live") return "bg-[#74c69d]";
  if (isActiveStatus(s)) return "bg-[#b8872f]";
  if (s === "failed" || s === "error") return "bg-[#c56b6b]";
  return "bg-zinc-700";
}

function statusTextColor(status: string) {
  const s = status.toLowerCase();
  if (s === "live") return "text-[#74c69d]";
  if (isActiveStatus(s)) return "text-[#b8872f]";
  if (s === "failed" || s === "error") return "text-[#c56b6b]";
  return "text-zinc-500";
}

function logColor(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("failed") || lower.includes("error")) return "text-[#c56b6b]";
  if (lower.includes("success") || lower.includes("live at") || lower.includes("healthy")) {
    return "text-[#74c69d]";
  }
  return "text-zinc-600";
}

function productionHost(host: string | null) {
  if (!host) return null;
  if (host.includes(".") || /^https?:\/\//.test(host)) return host;
  const baseDomain =
    process.env.NEXT_PUBLIC_USER_APP_BASE_DOMAIN || "hatchcloud.xyz";
  return `${host}.${baseDomain}`;
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
