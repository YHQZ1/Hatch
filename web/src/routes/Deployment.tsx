import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { PageLoadingState } from "@/components/LoadingState";
import { NoticeToast } from "@/components/NoticeToast";
import { AppShell, Button, PageTitle, StatusText } from "@/components/ui";
import { useNotice } from "@/components/useNotice";
import {
  apiFetch,
  apiJson,
  deploymentUrl,
  productionHost,
  readApiError,
  redirectIfUnauthorized,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  activityQuery,
  deploymentQuery,
  isActiveDeployment,
  projectDeploymentsQuery,
  projectQuery,
  projectsQuery,
} from "@/lib/queries";
import type { Deployment, Project } from "@/lib/types";

interface LogLine {
  text: string;
  timestamp?: string;
}

type DeploymentTone = "default" | "success" | "warning" | "danger" | "muted";

const PIPELINE_STEPS = [
  { key: "queued", label: "Queued" },
  { key: "building", label: "Building" },
  { key: "deploying", label: "Deploying" },
  { key: "live", label: "Live" },
];

const NO_LOG_LINES: string[] = [];

export default function DeploymentDetailClient() {
  const { id = "", deploymentId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [canceling, setCanceling] = useState(false);

  const deploymentResult = useQuery(deploymentQuery(deploymentId));
  const deployment = deploymentResult.data ?? null;
  const active = isActiveDeployment(deployment?.status);

  // The project only supplies a fallback subdomain, so failing to load it is fine.
  const projectResult = useQuery(projectQuery(id));
  const project = projectResult.data ?? null;

  const logsKey = ["deployments", deploymentId, "logs"] as const;
  const logsResult = useQuery({
    queryKey: logsKey,
    queryFn: () => apiJson<string[] | null>(`/api/deployments/${deploymentId}/logs`),
    select: (lines) => (Array.isArray(lines) ? lines : NO_LOG_LINES),
    refetchInterval: active ? 3500 : false,
  });
  const logs: LogLine[] = (logsResult.data ?? NO_LOG_LINES).map((text) => ({ text }));

  const loading =
    deploymentResult.isPending || projectResult.isPending || logsResult.isPending;

  const { notice, setNotice, dismiss } = useNotice({
    failedAt: deploymentResult.isError ? deploymentResult.errorUpdatedAt : null,
    notice: {
      type: "error",
      title: "Deployment unavailable",
      message:
        deploymentResult.error instanceof Error
          ? deploymentResult.error.message
          : "Hatch could not load this deployment.",
    },
  });

  const duration =
    deployment?.created_at && deployment.deployed_at
      ? Math.max(
          0,
          Math.round(
            (new Date(deployment.deployed_at).getTime() -
              new Date(deployment.created_at).getTime()) /
              1000,
          ),
        )
      : null;

  const liveUrl = deployment
    ? deploymentUrl(
        deployment.url || productionHost(deployment.subdomain || project?.subdomain || null),
      )
    : null;

  async function handleCancel() {
    if (!deployment || canceling || !isActiveDeployment(deployment.status)) return;
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
      queryClient.setQueryData(deploymentQuery(deploymentId).queryKey, canceled);
      queryClient.setQueryData<string[]>(logsKey, (lines) => [
        ...(lines ?? []),
        "Deployment canceled by user",
      ]);
      void queryClient.invalidateQueries({
        queryKey: projectDeploymentsQuery(id).queryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: projectsQuery().queryKey,
        exact: true,
      });
      void queryClient.invalidateQueries({ queryKey: activityQuery().queryKey });
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

  if (loading) return <PageLoadingState />;

  if (!deployment) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-base text-faint">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-faint">
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
      <NoticeToast notice={notice} onDismiss={dismiss} />
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

      <div className="mb-7 grid grid-cols-2 gap-x-8 gap-y-4 border-b border-line pb-7 sm:flex sm:items-end sm:gap-12 xl:mb-5 xl:shrink-0 xl:pb-5">
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
                <p className="font-mono text-sm text-faint">
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
              <code className="block break-all font-mono text-sm leading-relaxed text-muted">
                {deployment.id}
              </code>
              <div className="mt-5 space-y-3">
                <MiniKv label="Service" value={project?.repo_name || "-"} />
                <MiniKv label="Created" value={formatDateTime(deployment.created_at)} />
                <MiniKv label="Deployed" value={deployment.deployed_at ? formatDateTime(deployment.deployed_at) : "-"} />
              </div>
            </InfoCard>

            <InfoCard title="Network">
              <Kv label="Subdomain" value={deployment.subdomain || project?.subdomain || "-"} />
              <Kv
                label="URL"
                value={
                  liveUrl ? (
                    <a
                      href={liveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-success hover:underline"
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
    <section className="border-y border-line py-5">
      <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
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
    <section className="rounded-hatch border border-line bg-ink/[0.018] p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <StatusText tone={statusTone} pulse={active}>
          {resultLabel}
        </StatusText>
        <span className="font-mono text-[11px] text-faint">
          {formatDateTime(deployment.created_at)}
        </span>
      </div>
      <h2 className="max-w-4xl text-2xl font-medium leading-tight tracking-tight text-ink sm:text-3xl">
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
    <section className="grid overflow-hidden rounded-hatch border border-line bg-ink/[0.018] lg:grid-cols-4">
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
            className="border-b border-line p-5 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0"
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-faint">
                Step {String(index + 1).padStart(2, "0")}
              </p>
              <StatusText tone={tone} pulse={current}>
                {terminalProblem ? "stopped" : done ? "done" : current ? "now" : "wait"}
              </StatusText>
            </div>
            <p
              className={cn(
                "text-[1rem] font-medium",
                done && "text-ink",
                current && "text-warning",
                terminalProblem && "text-danger",
                !done && !current && !terminalProblem && "text-faint",
              )}
            >
              {step.label}
            </p>
            <p className="mt-2 font-mono text-[11px] text-faint">
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
    default: "text-ink",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    muted: "text-muted",
  } satisfies Record<DeploymentTone, string>;

  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
        {label}
      </p>
      <p className={cn("truncate font-mono text-sm", colors[tone])}>{value}</p>
    </div>
  );
}

function MiniKv({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
        {label}
      </span>
      <span className="truncate text-right font-mono text-xs text-muted">
        {value}
      </span>
    </div>
  );
}

function StaticMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-hatch border border-line bg-base px-4 py-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
        {label}
      </p>
      <p className="truncate font-mono text-sm text-muted">{value}</p>
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
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
        {label}
      </span>
      <span className="min-w-0 truncate text-right font-mono text-xs text-muted">
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

function deploymentStatusTone(status: string): DeploymentTone {
  const s = status.toLowerCase();
  if (s === "live") return "success";
  if (isActiveDeployment(s)) return "warning";
  if (s === "failed" || s === "error") return "danger";
  if (s === "canceled") return "muted";
  return "default";
}

function logColor(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("failed") || lower.includes("error")) return "text-danger";
  if (lower.includes("success") || lower.includes("live at") || lower.includes("healthy")) {
    return "text-success";
  }
  return "text-faint";
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
