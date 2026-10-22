import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { NoticeToast, type NoticePayload } from "@/components/NoticeToast";
import PageHeading from "@/components/PageHeading";
import { AppShell, Button } from "@/components/ui";
import { useNotice } from "@/components/useNotice";
import { apiFetch, pushFlashNotice, readApiError, redirectIfUnauthorized } from "@/lib/api";
import {
  NO_DEPLOYMENTS,
  activityQuery,
  isProjectTransitioning,
  projectDeploymentsQuery,
  projectQuery,
  projectsQuery,
} from "@/lib/queries";
import type { Project } from "@/lib/types";
import { ArrowLeftIcon } from "./overview/Glyphs";
import { abilities } from "./overview/overview";
import { useDeleteProject } from "./overview/useDeleteProject";
import { useProjectActions } from "./overview/useProjectActions";
import ApplyBanner from "./projectSettings/ApplyBanner";
import BuildSection from "./projectSettings/BuildSection";
import DeleteSection from "./projectSettings/DeleteSection";
import EnvSection from "./projectSettings/EnvSection";
import GeneralSection from "./projectSettings/GeneralSection";
import RuntimeSection from "./projectSettings/RuntimeSection";
import SectionNav, { type NavSection } from "./projectSettings/SectionNav";
import SourceSection from "./projectSettings/SourceSection";
import { useSaveProject } from "./projectSettings/useSaveProject";
import DeleteServiceModal from "./services/DeleteServiceModal";
import { type ServiceRow, projectName, toServiceRow } from "./services/service";

const SECTIONS: NavSection[] = [
  { id: "general", label: "General" },
  { id: "source", label: "Source" },
  { id: "build", label: "Build and run" },
  { id: "variables", label: "Environment variables" },
  { id: "runtime", label: "Runtime" },
  { id: "delete", label: "Delete project" },
];

/**
 * Everything about one project that can be changed, in sections that each save
 * on their own. What a deployment reads when it starts (branch, build settings,
 * variables) applies to the next one, and the page offers to deploy right away.
 */
export default function ProjectSettingsPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const projectResult = useQuery({
    ...projectQuery(id),
    // Suspending, resuming and deleting finish on their own; keep checking.
    refetchInterval: (query) => (isProjectTransitioning(query.state.data?.status) ? 3500 : false),
  });
  const deploymentsResult = useQuery(projectDeploymentsQuery(id));
  const project = projectResult.data ?? null;
  const deployments = deploymentsResult.data ?? NO_DEPLOYMENTS;
  const loading = projectResult.isPending;

  const { notice, setNotice, dismiss } = useNotice({
    failedAt: projectResult.isError ? projectResult.errorUpdatedAt : null,
    notice: {
      type: "error",
      title: "Settings unavailable",
      message: "Hatch could not load this project's settings.",
    },
  });

  const actions = useProjectActions(setNotice);
  const removal = useDeleteProject(setNotice, () => navigate("/overview"));
  const row = useMemo(() => (project ? toServiceRow(project, deployments[0]) : null), [project, deployments]);

  // On wide screens only this column scrolls; the heading, Back and the list of sections stay put.
  const column = useRef<HTMLDivElement>(null);
  const [applies, setApplies] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const deployNow = async () => {
    if (!project || deploying) return;
    setDeploying(true);
    try {
      // Only the project: its branch, port and health check come from the settings just saved.
      const res = await apiFetch("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      void queryClient.invalidateQueries({ queryKey: projectDeploymentsQuery(id).queryKey });
      void queryClient.invalidateQueries({ queryKey: projectsQuery().queryKey, exact: true });
      void queryClient.invalidateQueries({ queryKey: activityQuery().queryKey });
      pushFlashNotice({
        type: "success",
        title: "Deployment queued",
        message: "Live logs stream here as the build starts.",
      });
      navigate(`/projects/${id}`);
    } catch {
      setNotice({ type: "error", title: "Deploy request failed", message: "We couldn't reach the API." });
    } finally {
      setDeploying(false);
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
    <AppShell className="lg:h-[calc(100vh-64px)] lg:overflow-hidden" contentClassName="py-8 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      {/*
        Two columns from the top of the page. On a wide screen the left one
        (title, Back, the sections) stays put and the right one scrolls the
        full height; on a phone they stack and the page scrolls.
      */}
      <div className="grid gap-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[14rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-12">
        <div className="lg:flex lg:flex-col lg:gap-8">
          <div className="flex items-start justify-between gap-4 lg:flex-col lg:justify-start">
            {project ? (
              <PageHeading title="Project Settings" description={projectName(project)} />
            ) : (
              <div>
                <h1 className="sr-only">Project Settings</h1>
                <div aria-hidden className="h-8 w-44 animate-pulse rounded-hatch bg-line" />
                <div aria-hidden className="mt-2 h-4 w-28 animate-pulse rounded-hatch bg-line/60" />
              </div>
            )}
            <Button href={`/projects/${id}`} className="shrink-0">
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </Button>
          </div>

          <SectionNav sections={SECTIONS} scroller={column} ready={!loading} />
        </div>

        <div ref={column} className="min-w-0 lg:h-full lg:overflow-y-auto lg:px-1.5 lg:pb-8 lg:pr-4">
          {applies && project && row && (
            // On a wide screen it stays at the top of the scrolling column.
            <div className="mb-6 lg:sticky lg:top-0 lg:z-10 lg:-mx-1.5 lg:mb-0 lg:bg-base lg:px-1.5 lg:pb-6">
              <ApplyBanner
                deploying={deploying}
                canDeploy={abilities(project, deployments[0]).redeploy}
                onDeploy={() => void deployNow()}
                onDismiss={() => setApplies(false)}
              />
            </div>
          )}

          {project && row ? (
            <SettingsSections
              project={project}
              row={row}
              actions={actions}
              notify={setNotice}
              onAppliesNextDeploy={() => setApplies(true)}
              onDelete={() => removal.request(row)}
            />
          ) : (
            <div aria-hidden className="space-y-10">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-3">
                  <div className="h-5 w-32 animate-pulse rounded-hatch bg-line" />
                  <div className="h-10 max-w-2xl animate-pulse rounded-hatch border border-line bg-panel" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {removal.target && (
        <DeleteServiceModal
          project={removal.target.project}
          open
          deleting={removal.deleting}
          onClose={removal.cancel}
          onConfirm={removal.confirm}
        />
      )}

      <NoticeToast notice={notice} onDismiss={dismiss} />
    </AppShell>
  );
}

function SettingsSections({
  project,
  row,
  actions,
  notify,
  onAppliesNextDeploy,
  onDelete,
}: {
  project: Project;
  row: ServiceRow;
  actions: ReturnType<typeof useProjectActions>;
  notify: (notice: NoticePayload) => void;
  onAppliesNextDeploy: () => void;
  onDelete: () => void;
}) {
  const { save, saving } = useSaveProject(project, notify);
  const shared = { project, save, saving, onAppliesNextDeploy };

  return (
    <div className="min-w-0 space-y-10">
      <GeneralSection {...shared} />
      <SourceSection {...shared} />
      <BuildSection {...shared} />
      <EnvSection project={project} notify={notify} onAppliesNextDeploy={onAppliesNextDeploy} />
      <RuntimeSection row={row} actions={actions} />
      <DeleteSection project={project} onDelete={onDelete} />
    </div>
  );
}
