import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { NoticeToast } from "@/components/NoticeToast";
import PageHeading from "@/components/PageHeading";
import SelectField from "@/components/SelectField";
import { AppShell, Button } from "@/components/ui";
import { useNotice } from "@/components/useNotice";
import { useNow } from "@/lib/useNow";
import ActivityChart from "./deployments/ActivityChart";
import DeploymentRow from "./deployments/DeploymentRow";
import {
  ROW_HEIGHT,
  TABS,
  TAB_LABELS,
  countByTab,
  currentIds,
  matchesSearch,
  matchesTab,
  parseTab,
  stateOf,
} from "./deployments/deployments";
import Toolbar from "./overview/Toolbar";
import { useProjectActions } from "./overview/useProjectActions";
import { useSearchShortcut } from "./overview/useSearchShortcut";
import { projectName } from "./services/service";
import { useDeploymentFeed } from "./services/useDeploymentFeed";

/** How many deployments are listed at first, and how many each "Show more" adds. */
const PAGE = 50;

const ALL_PROJECTS = "all";

/**
 * Everything that has been shipped, across all projects: a two-week chart with
 * the numbers that summarise it, then one line per deployment, newest first.
 * Search, the project and the status are kept in the address.
 */
export default function DeploymentsPage() {
  const { items, loading, projectCount } = useDeploymentFeed();
  const { notice, setNotice, dismiss } = useNotice();
  const actions = useProjectActions(setNotice);
  const minute = useNow(60_000);
  const now = useMemo(() => new Date(minute), [minute]);
  const searchRef = useSearchShortcut();
  const [shown, setShown] = useState(PAGE);

  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const projectId = params.get("project") ?? ALL_PROJECTS;
  const tab = parseTab(params.get("status"));
  const setParam = (key: string, value: string, fallback = "") => {
    setShown(PAGE);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value && value !== fallback) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };

  // Which deployment is current depends on a project's whole history, so it is
  // worked out before anything is filtered away.
  const current = useMemo(() => currentIds(items), [items]);
  const projects = useMemo(() => {
    const byId = new Map(items.map(({ project }) => [project.id, project]));
    return [...byId.values()].sort((a, b) => projectName(a).localeCompare(projectName(b)));
  }, [items]);

  const ofProject = useMemo(
    () => (projectId === ALL_PROJECTS ? items : items.filter(({ project }) => project.id === projectId)),
    [items, projectId],
  );
  const searched = useMemo(() => ofProject.filter((item) => matchesSearch(item, query)), [ofProject, query]);
  const counts = useMemo(() => countByTab(searched), [searched]);
  const matching = useMemo(() => searched.filter((item) => matchesTab(item, tab)), [searched, tab]);
  const visible = useMemo(() => matching.slice(0, shown), [matching, shown]);
  // A project's icon is asked for once per redeploy, not once per row: every row
  // of a project shares the version of its newest deployment.
  const iconVersion = useMemo(() => {
    const newest = new Map<string, string>();
    for (const { project, deployment } of items) if (!newest.has(project.id)) newest.set(project.id, deployment.id);
    return newest;
  }, [items]);
  const liveProjects = useMemo(
    () => new Set(items.filter(({ deployment }) => current.has(deployment.id)).map(({ project }) => project.id)),
    [items, current],
  );

  const clear = () => setParams({}, { replace: true });
  const filtering = query.trim() !== "" || projectId !== ALL_PROJECTS || tab !== "all";

  return (
    <AppShell contentClassName="py-8">
      <div className="space-y-6">
        <PageHeading title="Deployments" />

        {(loading || items.length > 0) && (
          <Toolbar
            query={query}
            onQuery={(value) => setParam("q", value)}
            searchRef={searchRef}
            placeholder="Search deployments…"
            leading={
              <>
                <SelectField
                  label="Show deployments of"
                  value={projectId}
                  onChange={(value) => setParam("project", value, ALL_PROJECTS)}
                  className="w-36 sm:w-48"
                  options={[
                    { value: ALL_PROJECTS, label: "All projects" },
                    ...projects.map((p) => ({ value: p.id, label: projectName(p) })),
                  ]}
                />
                <SelectField
                  label="Show deployments with status"
                  value={tab}
                  onChange={(value) => setParam("status", value, "all")}
                  className="hidden w-44 sm:block"
                  options={TABS.map((t) => ({
                    value: t,
                    label: t === "all" ? "All statuses" : `${TAB_LABELS[t]} (${counts[t]})`,
                  }))}
                />
              </>
            }
          />
        )}

        {(loading || items.length > 0) && <ActivityChart items={ofProject} now={now} loading={loading} />}

        {loading ? (
          <Skeleton />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-start gap-4 rounded-hatch border border-dashed border-line-strong px-6 py-12">
            <p className="text-xl font-semibold tracking-tight">No deployments yet</p>
            <p className="max-w-md leading-relaxed text-muted">
              {projectCount === 0
                ? "Add a project and its builds and releases will be listed here, newest first."
                : "None of your projects has been deployed yet."}
            </p>
            <Button href="/new" variant="primary" className="h-10">
              New project
            </Button>
          </div>
        ) : matching.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-hatch border border-dashed border-line-strong px-6 py-10">
            <p className="text-lg font-semibold tracking-tight">No deployments match</p>
            <p className="text-sm text-muted">Try a different word, project or status.</p>
            {filtering && (
              <Button variant="secondary" onClick={clear}>
                Clear search and filters
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <ul className="rounded-hatch border border-line-strong bg-base">
              {visible.map((item) => (
                <DeploymentRow
                  key={item.deployment.id}
                  item={item}
                  info={stateOf(item, current)}
                  iconVersion={iconVersion.get(item.project.id) ?? ""}
                  projectLive={liveProjects.has(item.project.id)}
                  actions={actions}
                />
              ))}
            </ul>

            <div className="flex flex-col items-center gap-2">
              {matching.length > shown && (
                <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
                  Show more
                </Button>
              )}
              <p className="text-xs text-faint">
                {Math.min(shown, matching.length)} of {matching.length} deployments
              </p>
            </div>
          </div>
        )}
      </div>

      <NoticeToast notice={notice} onDismiss={dismiss} />
    </AppShell>
  );
}

/** Holds the list's space while it loads. */
function Skeleton() {
  return (
    <ul aria-hidden className="rounded-hatch border border-line-strong bg-base">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li key={i} className={`${ROW_HEIGHT} flex items-center gap-4 border-b border-line px-5 last:border-b-0`}>
          <div className="h-7 w-7 animate-pulse rounded-hatch bg-line" />
          <div className="h-4 w-28 animate-pulse rounded-hatch bg-line" />
          <div className="hidden h-4 w-1/3 animate-pulse rounded-hatch bg-line/60 lg:block" />
        </li>
      ))}
    </ul>
  );
}
