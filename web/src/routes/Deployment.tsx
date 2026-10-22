import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { NoticeToast } from "@/components/NoticeToast";
import { AppShell, Button } from "@/components/ui";
import { useNotice } from "@/components/useNotice";
import { ApiError } from "@/lib/api";
import { deploymentPath, deploymentRef, projectPath } from "@/lib/paths";
import { NO_DEPLOYMENTS, deploymentByRefQuery, projectDeploymentsQuery, projectQuery } from "@/lib/queries";
import { useCanonicalPath } from "@/lib/useCanonicalPath";
import DeploymentDetails from "./deployment/DeploymentDetails";
import { neighbours, shortId } from "./deployment/deployment";
import { canRollBack, currentIds, stateOf } from "./deployments/deployments";
import { ArrowLeftIcon } from "./overview/Glyphs";
import ProjectIcon from "./overview/ProjectIcon";
import { RepoLink } from "./overview/RepoLink";
import { abilities } from "./overview/overview";
import { useProjectActions } from "./overview/useProjectActions";
import DeploymentSummary from "./project/DeploymentSummary";
import LogViewer from "./project/LogViewer";
import { useDeploymentLogs } from "./project/useDeploymentLogs";
import { formatRepoSlug, projectName, toServiceRow } from "./services/service";

/**
 * One deployment on its own page, which is what a link to it opens: how it
 * stands, its full log (live while it runs), what it ran with, and what can be
 * done about it, with links to the ones either side. The Project page shows the
 * same pieces for whichever deployment is chosen in its list.
 */
export default function DeploymentPage() {
  const { id: ref = "" } = useParams();
  const navigate = useNavigate();

  // The address holds a short id; the deployment says which project it is in.
  const lookup = useQuery(deploymentByRefQuery(ref));
  const projectId = lookup.data?.project_id ?? "";
  const known = projectId !== "";
  const projectResult = useQuery({ ...projectQuery(projectId), enabled: known });
  const deploymentsResult = useQuery({ ...projectDeploymentsQuery(projectId), enabled: known });
  const project = projectResult.data ?? null;
  const deployments = deploymentsResult.data ?? NO_DEPLOYMENTS;
  // The list is the live copy (the log stream keeps its statuses current); the
  // lookup is where it comes from before the list has loaded.
  const deployment = deployments.find((item) => item.id === lookup.data?.id) ?? lookup.data ?? null;
  const deploymentId = deployment?.id ?? "";
  const loading = lookup.isPending || (known && (projectResult.isPending || deploymentsResult.isPending));
  // Opened by a whole id: show the short one.
  useCanonicalPath(deployment && ref !== deploymentRef(deployment.id) ? deploymentPath(deployment) : null);

  const { notice, setNotice, dismiss } = useNotice({
    failedAt: projectResult.isError
      ? projectResult.errorUpdatedAt
      : deploymentsResult.isError
        ? deploymentsResult.errorUpdatedAt
        : null,
    notice: { type: "error", title: "Deployment unavailable", message: "Hatch could not load this deployment." },
  });
  const actions = useProjectActions(setNotice);
  const logs = useDeploymentLogs(projectId, deployment?.id ?? null);

  const row = useMemo(() => (project ? toServiceRow(project, deployments[0]) : null), [project, deployments]);
  // Which deployment is current depends on the project's whole history.
  const current = useMemo(
    () => (project ? currentIds(deployments.map((item) => ({ deployment: item, project }))) : new Set<string>()),
    [project, deployments],
  );
  const info = project && deployment ? stateOf({ deployment, project }, current) : null;
  const around = useMemo(() => neighbours(deployments, deploymentId), [deployments, deploymentId]);

  if (!loading && (!project || !deployment)) {
    // The server explains an id that fits more than one deployment; anything else is just not found.
    const ambiguous = lookup.error instanceof ApiError && lookup.error.status === 409;
    return (
      <AppShell contentClassName="py-8">
        <div className="flex flex-col items-start gap-4 rounded-hatch border border-dashed border-line-strong px-6 py-12">
          <p className="text-xl font-semibold tracking-tight">{ambiguous ? "That id fits more than one deployment" : "Deployment not found"}</p>
          <p className="max-w-md leading-relaxed text-muted">
            {ambiguous
              ? "Use more of the deployment's id in the address."
              : "It may have been removed along with its project, or the link is wrong."}
          </p>
          <Button href={project ? projectPath(project) : "/deployments"} variant="secondary">
            {project ? "Back to the project" : "Go to the Deployments"}
          </Button>
        </div>
        <NoticeToast notice={notice} onDismiss={dismiss} />
      </AppShell>
    );
  }

  const busy = project ? actions.busy.has(project.id) : false;
  const canRoll = Boolean(project && deployment && info && canRollBack(deployment, info));
  const mayDeploy = project ? abilities(project, deployments[0]).redeploy : false;

  const rollBack = async () => {
    if (!project || !deployment) return;
    const created = await actions.rollback(project, deployment);
    if (created) navigate(deploymentPath(created));
  };

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
              {project ? (
                <>
                  <h1 className="truncate text-2xl font-semibold tracking-tight">
                    <Link to={projectPath(project)} className="transition-colors hover:text-muted">
                      {projectName(project)}
                    </Link>
                  </h1>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
                    <span>Deployment {shortId(deploymentId || ref)}</span>
                    <RepoLink url={project.repo_url} slug={formatRepoSlug(project.repo_url)} />
                  </div>
                </>
              ) : (
                <>
                  <h1 className="sr-only">Deployment</h1>
                  <div aria-hidden className="h-7 w-44 animate-pulse rounded-hatch bg-line" />
                  <div aria-hidden className="mt-2 h-4 w-64 animate-pulse rounded-hatch bg-line/60" />
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <Button href={project ? projectPath(project) : "/deployments"}>
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </Button>
            {canRoll && (
              <span title={mayDeploy ? "Run this release again" : "Wait for the current deployment to finish"}>
                <Button onClick={() => void rollBack()} disabled={!mayDeploy || busy}>
                  Roll back
                </Button>
              </span>
            )}
          </div>
        </div>

        {loading || !project || !deployment || !info ? (
          <div aria-hidden className="h-[142px] animate-pulse rounded-hatch border border-line bg-panel" />
        ) : (
          <DeploymentSummary
            deployment={deployment}
            info={info}
            project={project}
            canceling={busy}
            onCancel={() => void actions.cancel(project, deployment)}
          />
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <LogViewer
            key={deployment?.id ?? "none"}
            deployment={deployment}
            logs={logs}
            running={info?.state === "building"}
            className="h-[560px]"
            showId={false}
          />
          {project && deployment && (
            <DeploymentDetails deployment={deployment} project={project} newer={around.newer} older={around.older} />
          )}
        </div>
      </div>

      <NoticeToast notice={notice} onDismiss={dismiss} />
    </AppShell>
  );
}
