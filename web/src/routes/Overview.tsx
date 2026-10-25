import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { NoticeToast } from "@/components/NoticeToast";
import SelectField from "@/components/SelectField";
import { AppShell, Button } from "@/components/ui";
import { PlusIcon } from "./overview/Glyphs";
import { useNotice } from "@/components/useNotice";
import { getAppConfig } from "@/lib/api";
import { useAwsConnection } from "@/lib/aws";
import { githubReposQuery, isActiveDeployment, trafficQuery } from "@/lib/queries";
import { useServiceRows } from "./services/useServiceRows";
import AccountPanel from "./overview/AccountPanel";
import { NoMatches, NoProjects } from "./overview/EmptyStates";
import RecentActivity from "./overview/RecentActivity";
import RightNow from "./overview/RightNow";
import ProjectCard from "./overview/ProjectCard";
import ProjectRow from "./overview/ProjectRow";
import SetupChecklist, { SetupChecklistSkeleton } from "./overview/SetupChecklist";
import { setupSteps } from "./overview/setup";
import Toolbar, { FilterTabs, type ViewMode } from "./overview/Toolbar";
import TrafficPanel from "./overview/TrafficPanel";
import {
  countByFilter,
  filterByQuery,
  matchesFilter,
  parseFilter,
  ROW_HEIGHT,
} from "./overview/overview";
import { SORTS, SORT_LABELS, parseSort, recentTicks, sortRows } from "./overview/history";
import { useDeleteProject } from "./overview/useDeleteProject";
import { useProjectActions } from "./overview/useProjectActions";
import { useSearchShortcut } from "./overview/useSearchShortcut";
import { useStoredView } from "./overview/useStoredView";
import DeleteServiceModal from "./services/DeleteServiceModal";

/**
 * Set once the checklist has been seen complete. It lets a reload with nothing
 * cached skip the checklist placeholder, so a finished account does not see a
 * box appear and vanish.
 */
const SETUP_DONE_KEY = "hatch_setup_done";
const VIEW_KEY = "hatch_overview_view";

function readSetupDone(): boolean {
  try {
    return localStorage.getItem(SETUP_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSetupDone(done: boolean) {
  try {
    if (done) localStorage.setItem(SETUP_DONE_KEY, "1");
    else localStorage.removeItem(SETUP_DONE_KEY);
  } catch {
    // The hint is only an optimisation.
  }
}

/**
 * Home, and the one place projects are listed: find a project, act on it, see
 * what is building, and how much traffic it gets.
 */
export default function OverviewPage() {
  const { rows, deployments, loading } = useServiceRows();
  const repos = useQuery(githubReposQuery());
  const traffic = useQuery(trafficQuery());
  const { notice, setNotice, dismiss } = useNotice();
  const actions = useProjectActions(setNotice);
  const removal = useDeleteProject(setNotice);

  // The search, the filter and the sort live in the address, so a view can be
  // shared and the back button undoes it.
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const filter = parseFilter(params.get("filter"));
  const sort = parseSort(params.get("sort"));
  const setParam = (key: string, value: string, fallback = "") =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value && value !== fallback) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const [view, setView] = useStoredView(VIEW_KEY);
  const searchRef = useSearchShortcut();

  const aws = useAwsConnection();
  const awsAvailable = getAppConfig().awsConnections;
  const steps = setupSteps({
    appInstalled: repos.data?.installed === true,
    awsAvailable,
    awsConnected: aws.connected,
    hasProjects: rows.length > 0,
  });
  // The answers are needed to know whether setup is finished. Until then the
  // checklist's space is held (unless it was finished last time), so nothing
  // jumps when the answer arrives.
  const setupKnown = !loading && !repos.isPending && !(awsAvailable && aws.loading);
  const setupFinished = steps.every((step) => step.done);
  const [wasFinished] = useState(readSetupDone);
  const showSetup = setupKnown && !setupFinished;
  const showSetupSkeleton = !setupKnown && !wasFinished;

  useEffect(() => {
    if (setupKnown) writeSetupDone(setupFinished);
  }, [setupKnown, setupFinished]);

  const counts = useMemo(() => countByFilter(rows), [rows]);
  const matching = useMemo(() => {
    const apps = traffic.data?.apps;
    const requests = (row: (typeof rows)[number]) => {
      const sub = row.project.subdomain;
      return (sub && apps?.[sub]?.total_requests) || 0;
    };
    return sortRows(filterByQuery(rows, query).filter((row) => matchesFilter(row, filter)), sort, requests);
  }, [rows, query, filter, sort, traffic.data]);
  const building = useMemo(
    () => rows.filter((row) => isActiveDeployment(row.lastDeployment?.status)),
    [rows],
  );
  const searching = query.trim() !== "" || filter !== "all";

  return (
    <AppShell contentClassName="py-8">
      <h1 className="sr-only">Overview</h1>

      {/*
        Like Vercel's dashboard: a bar across the top, then the projects on the
        right and what surrounds them in a column on the left. Below the wide
        breakpoint the wrapper disappears (`contents`) and the panels stack in
        the order given by `order-*`: setup, search, what is building, the
        projects, then traffic, activity and the account.
      */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-x-8 lg:gap-y-6">
        {(loading || rows.length > 0) && (
          <Toolbar
            query={query}
            onQuery={(value) => setParam("q", value)}
            view={view}
            onView={setView}
            searchRef={searchRef}
            className="order-2 lg:col-span-2"
            leading={
              <SelectField
                label="Sort projects"
                value={sort}
                onChange={(value) => setParam("sort", value, "activity")}
                options={SORTS.map((key) => ({ value: key, label: SORT_LABELS[key] }))}
              />
            }
            trailing={
              <Button href="/new" variant="primary" className="h-10 shrink-0 px-4">
                <PlusIcon className="h-4 w-4" />
                <span className="hidden sm:inline">New project</span>
                <span className="sm:hidden">New</span>
              </Button>
            }
          />
        )}

        <div className="contents lg:col-start-1 lg:row-start-2 lg:flex lg:flex-col lg:gap-6">
          {showSetup && <SetupChecklist steps={steps} className="order-1" />}
          {showSetupSkeleton && <SetupChecklistSkeleton className="order-1" />}
          <RightNow rows={building} actions={actions} className="order-3" />
          <TrafficPanel
            traffic={traffic.data}
            rows={rows}
            loading={traffic.isPending || loading}
            className="order-5"
          />
          <RecentActivity className="order-6" />
          <AccountPanel className="order-7" />
        </div>

        <section
          aria-label="Projects"
          className="order-4 min-w-0 space-y-5 lg:col-start-2 lg:row-start-2"
        >
          {rows.length > 0 && (
            <FilterTabs filter={filter} onFilter={(value) => setParam("filter", value, "all")} counts={counts} />
          )}

          {loading ? (
            <ProjectsSkeleton view={view} />
          ) : rows.length === 0 ? (
            <NoProjects />
          ) : matching.length === 0 ? (
            <NoMatches query={query} onClear={() => setParams({}, { replace: true })} />
          ) : view === "grid" ? (
            <div className="grid gap-4 md:grid-cols-2">
              {matching.map((row) => (
                <ProjectCard
                  key={row.project.id}
                  row={row}
                  ticks={recentTicks(deployments[row.project.id] ?? [])}
                  actions={actions}
                  onDelete={removal.request}
                />
              ))}
            </div>
          ) : (
            <ul className="rounded-hatch border border-line-strong bg-base">
              {matching.map((row) => (
                <ProjectRow key={row.project.id} row={row} actions={actions} onDelete={removal.request} />
              ))}
            </ul>
          )}

          {!loading && searching && matching.length > 0 && (
            <p className="text-center text-xs text-faint">
              {matching.length} of {rows.length} projects
            </p>
          )}
        </section>
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

/** Holds the projects' space while they load, with cards or rows to match the view. */
function ProjectsSkeleton({ view }: { view: ViewMode }) {
  if (view === "list") {
    return (
      <ul aria-hidden className="rounded-hatch border border-line-strong bg-base">
        {[0, 1, 2].map((i) => (
          <li key={i} className={`${ROW_HEIGHT} flex items-center gap-4 border-b border-line px-4 last:border-b-0`}>
            <div className="h-9 w-9 animate-pulse rounded-hatch bg-line" />
            <div className="w-1/3 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded-hatch bg-line" />
              <div className="h-3 w-1/2 animate-pulse rounded-hatch bg-line/60" />
            </div>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div aria-hidden className="grid gap-4 md:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className="h-[200px] animate-pulse rounded-hatch border border-line bg-panel" />
      ))}
    </div>
  );
}
