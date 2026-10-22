import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { NoticeToast } from "@/components/NoticeToast";
import { AppShell, Button } from "@/components/ui";
import { useNotice } from "@/components/useNotice";
import { apiFetch, readApiError, redirectIfUnauthorized } from "@/lib/api";
import {
  NO_DEPLOYMENTS,
  activityQuery,
  projectDeploymentsQuery,
  projectQuery,
  projectsQuery,
} from "@/lib/queries";
import type { Deployment } from "@/lib/types";
import { currentIds, stateOf } from "./deployments/deployments";
import { Address } from "./overview/Address";
import { ArrowLeftIcon } from "./overview/Glyphs";
import ProjectIcon from "./overview/ProjectIcon";
import { RepoLink } from "./overview/RepoLink";
import { displayName } from "./overview/overview";
import DeploymentList from "./project/DeploymentList";
import DeploymentSummary from "./project/DeploymentSummary";
import LogViewer from "./project/LogViewer";
import { useDeploymentLogs } from "./project/useDeploymentLogs";
import { toServiceRow } from "./services/service";

/**
 * One project: what it is serving, how its latest deployment went, the log of
 * the deployment you choose, and every deployment it has had.
 */
export default function ProjectPage() {
  const { id: projectId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const projectResult = useQuery(projectQuery(projectId));
  const deploymentsResult = useQuery(projectDeploymentsQuery(projectId));
  const project = projectResult.data ?? null;
  const deployments = deploymentsResult.data ?? NO_DEPLOYMENTS;
  const loading = projectResult.isPending || deploymentsResult.isPending;

  // The deployment being viewed: the one picked, else the latest.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const active = deployments.find((item) => item.id === pickedId) ?? deployments[0] ?? null;
  const logs = useDeploymentLogs(projectId, active?.id ?? null);

  const [deploying, setDeploying] = useState(false);
  const [canceling, setCanceling] = useState(false);

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

  const row = useMemo(() => (project ? toServiceRow(project, deployments[0]) : null), [project, deployments]);
  // Which deployment is current depends on the project's whole history.
  const current = useMemo(
    () => (project ? currentIds(deployments.map((deployment) => ({ deployment, project }))) : new Set<string>()),
    [project, deployments],
  );
  const info = project && active ? stateOf({ deployment: active, project }, current) : null;

  const invalidateLists = () => {
    void queryClient.invalidateQueries({ queryKey: projectsQuery().queryKey, exact: true });
    void queryClient.invalidateQueries({ queryKey: activityQuery().queryKey });
  };

  const deploy = async () => {
    if (!project || deploying) return;
    setDeploying(true);
    try {
      const res = await apiFetch("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the project: its branch, port and health check come from its
        // settings, so a change made there applies to this deployment.
        body: JSON.stringify({ project_id: project.id }),
      });
      if (redirectIfUnauthorized(res, navigate)) return;
      if (!res.ok) {
        setNotice({
          type: "error",
          title: "Deploy failed to start",
          message: await readApiError(res, "The deployment could not be queued."),
        });
        return;
      }
      const queued = (await res.json()) as Deployment;
      queryClient.setQueryData<Deployment[]>(projectDeploymentsQuery(projectId).queryKey, (list) => [
        queued,
        ...(list ?? []),
      ]);
      invalidateLists();
      setPickedId(queued.id);
      setNotice({
        type: "success",
        title: "Deployment queued",
        message: "Live logs will stream here as the build starts.",
      });
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

  const cancel = async () => {
    if (!active || canceling) return;
    if (!confirm("Cancel this deployment?")) return;

    setCanceling(true);
    try {
      const res = await apiFetch(`/api/deployments/${active.id}/cancel`, { method: "POST" });
      if (redirectIfUnauthorized(res, navigate)) return;
      if (!res.ok) {
        setNotice({
          type: "error",
          title: "Cancel failed",
          message: await readApiError(res, "This deployment can no longer be canceled."),
        });
        return;
      }
      const canceled = (await res.json()) as Deployment;
      queryClient.setQueryData<Deployment[]>(projectDeploymentsQuery(projectId).queryKey, (list) =>
        list?.map((item) => (item.id === canceled.id ? canceled : item)),
      );
      invalidateLists();
      setPickedId(canceled.id);
      setNotice({
        type: "success",
        title: "Deployment canceled",
        message: "Provisioning has been stopped for this run.",
      });
    } finally {
      setCanceling(false);
    }
  };

  if (!loading && !project) {
    return (
      <AppShell contentClassName="py-8">
        <div className="flex flex-col items-start gap-4 rounded-hatch border border-dashed border-line-strong px-6 py-12">
          <p className="text-xl font-semibold tracking-tight">Project not found</p>
          <p className="max-w-md leading-relaxed text-muted">
            It may have been deleted, or the link is wrong. Your projects are on the Overview.
          </p>
          <Button href="/overview" variant="secondary">
            Go to the Overview
          </Button>
        </div>
        <NoticeToast notice={notice} onDismiss={dismiss} />
      </AppShell>
    );
  }

  return (
    <AppShell contentClassName="py-8">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {project && row ? (
              <ProjectIcon
                projectId={project.id}
                version={deployments[0]?.id}
                running={row.status.kind === "live"}
                size={48}
              />
            ) : (
              <div aria-hidden className="h-12 w-12 shrink-0 animate-pulse rounded-hatch bg-line" />
            )}
            <div className="min-w-0">
              {row ? (
                <>
                  <h1 className="truncate text-2xl font-semibold tracking-tight">{displayName(row)}</h1>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
                    <RepoLink url={row.project.repo_url} slug={row.repoSlug} />
                    <Address row={row} inline />
                  </div>
                </>
              ) : (
                <>
                  <h1 className="sr-only">Project</h1>
                  <div aria-hidden className="h-7 w-44 animate-pulse rounded-hatch bg-line" />
                  <div aria-hidden className="mt-2 h-4 w-64 animate-pulse rounded-hatch bg-line/60" />
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <Button href="/overview">
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </Button>
            <Button href={`/projects/${projectId}/settings`}>Settings</Button>
            <Button variant="primary" onClick={deploy} disabled={!project || deploying || canceling}>
              {deploying ? "Deploying…" : "Deploy"}
            </Button>
          </div>
        </div>

        {loading ? (
          <div aria-hidden className="h-[142px] animate-pulse rounded-hatch border border-line bg-panel" />
        ) : active && project && info ? (
          <DeploymentSummary deployment={active} info={info} project={project} canceling={canceling} onCancel={cancel} />
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-hatch border border-dashed border-line-strong px-6 py-10">
            <p className="text-lg font-semibold tracking-tight">Not deployed yet</p>
            <p className="max-w-md text-sm leading-relaxed text-muted">
              Deploy builds the project from {project?.branch ?? "its branch"} and starts it.
            </p>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <LogViewer
            key={active?.id ?? "none"}
            deployment={active}
            logs={logs}
            running={info?.state === "building"}
          />
          {project && (
            <DeploymentList
              project={project}
              deployments={deployments}
              current={current}
              activeId={active?.id ?? null}
              onSelect={(deployment) => setPickedId(deployment.id)}
            />
          )}
        </div>
      </div>

      <NoticeToast notice={notice} onDismiss={dismiss} />
    </AppShell>
  );
}
