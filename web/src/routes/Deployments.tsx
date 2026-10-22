import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { AppShell, Button, EmptyStateBlock, PageTitle, Panel } from "@/components/ui";
import { cn } from "@/lib/cn";
import { projectsQuery } from "@/lib/queries";
import Frame from "./landing/Frame";
import { ServiceSkeleton, StatusBadge } from "./services/ServiceTable";
import {
  type StatusKind,
  formatCommit,
  formatDeploymentDuration,
  formatRelativeTime,
  getStatusMeta,
} from "./services/service";
import { type FeedItem, useDeploymentFeed } from "./services/useDeploymentFeed";

/** How many deployments are listed; older ones are on each project's page. */
const SHOWN = 100;

const FILTERS = [
  { id: "all", label: "All", kinds: null },
  { id: "live", label: "Live", kinds: ["live"] },
  { id: "building", label: "Building", kinds: ["active"] },
  { id: "failed", label: "Failed", kinds: ["failed"] },
] as const satisfies readonly { id: string; label: string; kinds: StatusKind[] | null }[];

type FilterId = (typeof FILTERS)[number]["id"];

const COLUMNS =
  "xl:grid-cols-[minmax(0,1.2fr)_130px_minmax(0,2fr)_minmax(0,1fr)_110px_100px]";

/** Every build and release across all projects, newest first. */
export default function DeploymentsPage() {
  const queryClient = useQueryClient();
  const { items, loading, refreshing, projectCount } = useDeploymentFeed();
  const [filter, setFilter] = useState<FilterId>("all");

  const withStatus = useMemo(
    () => items.map((item) => ({ ...item, status: getStatusMeta(item.deployment.status) })),
    [items],
  );
  const counts = useMemo(() => {
    const out: Record<FilterId, number> = { all: withStatus.length, live: 0, building: 0, failed: 0 };
    for (const item of withStatus) {
      if (item.status.kind === "live") out.live += 1;
      if (item.status.kind === "active") out.building += 1;
      if (item.status.kind === "failed") out.failed += 1;
    }
    return out;
  }, [withStatus]);

  const active = FILTERS.find((item) => item.id === filter)!;
  const visible = withStatus
    .filter((item) => !active.kinds || (active.kinds as readonly StatusKind[]).includes(item.status.kind))
    .slice(0, SHOWN);

  return (
    <AppShell>
      <PageTitle
        title="Deployments"
        description="Every build and release across your projects, newest first."
        actions={
          <Button
            disabled={refreshing}
            onClick={() => void queryClient.invalidateQueries({ queryKey: projectsQuery().queryKey })}
            className="h-10"
          >
            Refresh
          </Button>
        }
      />

      {(loading || items.length > 0) && (
        <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                "h-9 rounded-hatch border px-3.5 text-sm transition-colors",
                filter === item.id
                  ? "border-accent bg-accent/10 text-ink"
                  : "border-line-strong text-muted hover:border-ink/40 hover:text-ink",
              )}
            >
              {item.label}
              {!loading && <span className="ml-2 font-mono text-xs text-faint">{counts[item.id]}</span>}
            </button>
          ))}
        </div>
      )}

      <Frame>
        <Panel className="overflow-hidden">
          {(loading || items.length > 0) && <Header />}
          {loading ? (
            <ServiceSkeleton />
          ) : items.length === 0 ? (
            <EmptyStateBlock
              title="No deployments yet"
              description={
                projectCount === 0
                  ? "Deploy a project and its builds and releases will be listed here."
                  : "None of your projects has been deployed yet."
              }
              action={
                <Button href="/new" variant="primary" className="h-10">
                  New project
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted">
              No {active.label.toLowerCase()} deployments.
            </p>
          ) : (
            visible.map((item) => <Row key={item.deployment.id} item={item} />)
          )}
        </Panel>
      </Frame>
    </AppShell>
  );
}

function Header() {
  return (
    <div className={cn("hidden gap-4 border-b border-line bg-panel px-5 py-3 xl:grid", COLUMNS)}>
      {["Project", "Status", "Commit", "Branch", "Started", "Duration"].map((label) => (
        <div key={label} className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
          {label}
        </div>
      ))}
    </div>
  );
}

function Row({ item }: { item: FeedItem & { status: ReturnType<typeof getStatusMeta> } }) {
  const { deployment, project, status } = item;
  const commit = formatCommit(deployment);
  const href = `/projects/${project.id}/deployments/${deployment.id}`;

  return (
    <Link
      to={href}
      className="block border-b border-line px-5 py-4 transition-colors last:border-b-0 hover:bg-ink/[0.03]"
    >
      <div className={cn("hidden items-center gap-4 xl:grid", COLUMNS)}>
        <span className="truncate text-sm font-medium">{project.repo_name}</span>
        <StatusBadge status={status} />
        <div className="min-w-0">
          <p className="truncate text-sm">{commit.message ?? "No commit message"}</p>
          <p className="font-mono text-xs text-faint">{commit.short}</p>
        </div>
        <span className="truncate font-mono text-xs text-muted">{deployment.branch}</span>
        <span className="text-sm text-muted">{formatRelativeTime(deployment.created_at)}</span>
        <span className="font-mono text-xs text-muted">{formatDeploymentDuration(deployment)}</span>
      </div>

      <div className="xl:hidden">
        <div className="flex items-start justify-between gap-4">
          <span className="min-w-0 truncate text-sm font-medium">{project.repo_name}</span>
          <StatusBadge status={status} />
        </div>
        <p className="mt-2 truncate text-sm text-muted">{commit.message ?? "No commit message"}</p>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
          {commit.short} · {deployment.branch} · {formatRelativeTime(deployment.created_at)} ·{" "}
          {formatDeploymentDuration(deployment)}
        </p>
      </div>
    </Link>
  );
}
