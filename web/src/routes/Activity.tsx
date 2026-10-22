import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { NO_ACTIVITY, activityQuery } from "@/lib/queries";
import type { ActivityEvent } from "@/lib/types";
import { activityKind, activityMeta } from "./services/activity";
import {
  AppShell,
  Button,
  EmptyStateBlock,
  MetricCard,
  PageTitle,
  Panel,
} from "@/components/ui";

export default function ActivityClient() {
  const activity = useQuery(activityQuery());
  const events = activity.data ?? NO_ACTIVITY;
  const loading = activity.isPending;
  const lastSyncedAt = activity.dataUpdatedAt
    ? new Date(activity.dataUpdatedAt)
    : null;

  const stats = useMemo(() => {
    return {
      total: events.length,
      creates: events.filter((event) => activityKind(event.type) === "create")
        .length,
      deploys: events.filter((event) => activityKind(event.type) === "deploy")
        .length,
      deletes: events.filter((event) => activityKind(event.type) === "delete")
        .length,
    };
  }, [events]);

  return (
    <AppShell>
      <ActivityHeader
        lastSyncedAt={lastSyncedAt}
        refreshing={activity.isFetching && !loading}
        onRefresh={() => void activity.refetch()}
      />

      {!loading && events.length > 0 && (
        <div className="mb-7 grid grid-cols-2 gap-x-8 gap-y-4 border-b border-line pb-7 sm:flex sm:items-end sm:gap-12">
          <MetricCard label="Events" value={stats.total.toString()} />
          <MetricCard
            label="Deploys"
            value={stats.deploys.toString()}
            tone="warning"
          />
          <MetricCard
            label="Created"
            value={stats.creates.toString()}
            tone="success"
          />
          <MetricCard label="Deleted" value={stats.deletes.toString()} tone="danger" />
        </div>
      )}

      <Panel className="w-full">
        {(events.length > 0 || loading) && <ActivityTableHeader />}

        {loading ? (
          <ActivitySkeleton />
        ) : events.length > 0 ? (
          <div>
            {events.map((event) => (
              <ActivityRow key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </Panel>
    </AppShell>
  );
}

function ActivityHeader({
  lastSyncedAt,
  refreshing,
  onRefresh,
}: {
  lastSyncedAt: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <PageTitle
      title="Activity"
      description="A live audit trail for project changes, deployments, and infrastructure events."
      actions={
        <>
          <div className="mr-1 min-w-24 text-left sm:text-right">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint font-bold">
              {refreshing ? "Refreshing" : "Last synced"}
            </p>
            <p className="mt-1 text-[11px] text-faint">
              {lastSyncedAt
                ? formatRelativeTime(lastSyncedAt.toISOString())
                : "—"}
            </p>
          </div>
          <Button onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Syncing" : "Refresh"}
          </Button>
        </>
      }
    />
  );
}

function ActivityTableHeader() {
  return (
    <div className="hidden lg:grid grid-cols-[0.75fr_0.8fr_2.7fr_0.75fr] border-b border-line px-1">
      {["Time", "Type", "Event", "Reference"].map((header, index) => (
        <div
          key={header}
          className={`py-3 text-[11px] uppercase tracking-[0.18em] text-faint font-bold ${
            index === 3 ? "text-right" : ""
          }`}
        >
          {header}
        </div>
      ))}
    </div>
  );
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const kind = activityKind(event.type);
  const meta = activityMeta(kind);

  return (
    <article className="border-b border-line last:border-b-0 hover:bg-ink/[0.018] transition-colors">
      <div className="hidden lg:grid grid-cols-[0.75fr_0.8fr_2.7fr_0.75fr] px-1 py-4 items-center">
        <TimeCell date={event.created_at} />
        <TypeCell type={event.type} meta={meta} />
        <div className="min-w-0">
          <p className="text-[13px] text-ink tracking-tight truncate">
            {event.message}
          </p>
          <p className="text-[11px] text-faint font-mono mt-0.5">
            {formatDate(event.created_at)}
          </p>
        </div>
        <div className="text-right font-mono text-[11px] text-faint">
          {event.id.split("-")[0]}
        </div>
      </div>

      <div className="lg:hidden p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <TypeCell type={event.type} meta={meta} />
            <p className="text-[13px] text-ink tracking-tight mt-3 leading-relaxed">
              {event.message}
            </p>
          </div>
          <span className="font-mono text-[11px] text-faint shrink-0">
            {event.id.split("-")[0]}
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 text-[11px] text-faint font-mono">
          <span>{formatTime(event.created_at)}</span>
          <span>{formatDate(event.created_at)}</span>
        </div>
      </div>
    </article>
  );
}

function TypeCell({
  type,
  meta,
}: {
  type: string;
  meta: ReturnType<typeof activityMeta>;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${meta.dot}`} />
      <span
        className={`text-[11px] font-bold uppercase tracking-widest truncate ${meta.text}`}
      >
        {type}
      </span>
    </div>
  );
}

function TimeCell({ date }: { date: string }) {
  return (
    <div className="font-mono text-[11px] text-muted">
      {formatTime(date)}
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div>
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="grid lg:grid-cols-[0.75fr_0.8fr_2.7fr_0.75fr] px-1 py-4 border-b border-line items-center last:border-b-0 gap-4"
          style={{ opacity: 1 - index * 0.13 }}
        >
          <div className="h-2 w-16 bg-line/70 rounded-full animate-pulse" />
          <div className="h-2 w-14 bg-line/70 rounded-full animate-pulse" />
          <div className="h-2.5 w-full max-w-lg bg-line rounded-full animate-pulse" />
          <div className="hidden lg:block h-2 w-16 bg-line/50 rounded-full animate-pulse ml-auto" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <EmptyStateBlock
      title="No activity recorded"
      description="Create a service, trigger a deployment, or change infrastructure to start building an audit trail."
    />
  );
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (Number.isNaN(date.getTime())) return "—";
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
