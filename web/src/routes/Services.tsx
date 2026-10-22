import { useQueryClient } from "@tanstack/react-query";
import { NoticeToast, type NoticePayload } from "@/components/NoticeToast";
import { useNotice } from "@/components/useNotice";
import { AppShell, Button, PageTitle, Panel } from "@/components/ui";
import { projectsQuery } from "@/lib/queries";
import type { Project } from "@/lib/types";
import Frame from "./landing/Frame";
import {
  EmptyServices,
  ServiceRowItem,
  ServiceSkeleton,
  TableHeader,
} from "./services/ServiceTable";
import { formatRelativeTime } from "./services/service";
import StatStrip from "./services/StatStrip";
import { useServiceRows } from "./services/useServiceRows";

const LOAD_FAILED_NOTICE: NoticePayload = {
  type: "error",
  title: "Services unavailable",
  message: "We couldn't load the latest service list.",
};

/** Every service, as a table with its status, commit and actions. */
export default function ServicesPage() {
  const queryClient = useQueryClient();
  const { projectsResult, rows, stats, loading, refreshing, lastSyncedAt, expectServices } =
    useServiceRows();
  const { notice, setNotice, dismiss } = useNotice({
    failedAt: projectsResult.isError ? projectsResult.errorUpdatedAt : null,
    notice: LOAD_FAILED_NOTICE,
  });
  const hasProjects = rows.length > 0;

  const handleDeleteQueued = (project: Project) => {
    queryClient.setQueryData<Project[]>(projectsQuery().queryKey, (current) =>
      current?.map((item) => (item.id === project.id ? project : item)),
    );
  };

  return (
    <AppShell>
      <NoticeToast notice={notice} onDismiss={dismiss} />

      <PageTitle
        title="Services"
        description="Everything you have deployed through Hatch, and what state it is in."
        actions={
          <>
            <p className="mr-2 hidden font-mono text-[11px] uppercase tracking-[0.14em] text-faint sm:block">
              {refreshing
                ? "Syncing"
                : lastSyncedAt
                  ? `Synced ${formatRelativeTime(lastSyncedAt.toISOString())}`
                  : ""}
            </p>
            <Button
              disabled={refreshing}
              onClick={() =>
                void queryClient.invalidateQueries({
                  queryKey: projectsQuery().queryKey,
                })
              }
              className="h-10"
            >
              Refresh
            </Button>
            <Button href="/new" variant="primary" className="h-10 sm:hidden">
              New service
            </Button>
          </>
        }
      />

      <StatStrip
        stats={stats}
        loading={loading}
        expectServices={expectServices}
        failedLabel="Failed"
      />

      <Frame>
        <Panel className="overflow-hidden">
          {(hasProjects || loading) && <TableHeader />}
          {loading ? (
            <ServiceSkeleton />
          ) : !hasProjects ? (
            <EmptyServices />
          ) : (
            rows.map((row) => (
              <ServiceRowItem
                key={row.project.id}
                row={row}
                onNotice={setNotice}
                onDeleteQueued={handleDeleteQueued}
              />
            ))
          )}
        </Panel>
      </Frame>
    </AppShell>
  );
}
