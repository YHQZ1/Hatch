import { Panel } from "@/components/ui";
import type { Traffic } from "@/lib/types";
import type { ServiceRow } from "../services/service";
import PanelHeader from "./PanelHeader";
import ProjectIcon from "./ProjectIcon";
import Sparkline from "./Sparkline";
import { compactNumber, displayName, errorRate, formatPercent, sumSeries } from "./overview";

/**
 * Requests across all projects for the last hour, and which projects got them.
 * The counts come from Hatch's own proxy, so the panel says so, and says when
 * the target has no proxy to count them.
 */
export default function TrafficPanel({
  traffic,
  rows,
  loading,
  className,
}: {
  traffic: Traffic | undefined;
  rows: ServiceRow[];
  loading: boolean;
  className?: string;
}) {
  const apps = traffic?.available
    ? rows.flatMap((row) => {
        const t = row.project.subdomain ? traffic.apps[row.project.subdomain] : undefined;
        return t ? [{ row, t }] : [];
      })
    : [];
  const requests = sumSeries(apps.map(({ t }) => t.requests));
  const errors = sumSeries(apps.map(({ t }) => t.errors));
  const total = apps.reduce((sum, { t }) => sum + t.total_requests, 0);
  const failed = apps.reduce((sum, { t }) => sum + t.total_errors, 0);
  const rate = errorRate({ total_requests: total, total_errors: failed });
  const top = [...apps]
    .filter(({ t }) => t.total_requests > 0)
    .sort((a, b) => b.t.total_requests - a.t.total_requests)
    .slice(0, 5);

  return (
    <Panel className={className}>
      <PanelHeader title="Traffic" aside="Last hour" />

      {loading ? (
        <div aria-hidden className="space-y-3 p-4">
          <div className="h-8 w-24 animate-pulse rounded-hatch bg-line" />
          <div className="h-16 animate-pulse rounded-hatch bg-line/60" />
        </div>
      ) : !traffic?.available ? (
        <p className="p-4 text-[13px] leading-relaxed text-muted">
          Traffic is counted by the proxy Hatch runs for the local target, so it is not available on
          the AWS target yet.
        </p>
      ) : (
        <>
          <div className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[28px] font-semibold leading-none tabular-nums tracking-tight">
                {total.toLocaleString("en-US")}
                <span className="ml-2 text-[13px] font-normal tracking-normal text-muted">requests</span>
              </p>
              {rate !== null && (
                <p className={rate > 0 ? "text-xs text-danger" : "text-xs text-muted"}>{formatPercent(rate)} errors</p>
              )}
            </div>
            <Sparkline
              requests={requests}
              errors={errors}
              label={`${total} requests across all projects in the last hour`}
              className="mt-4 h-14"
            />
            <div className="mt-1 flex justify-between text-xs text-faint">
              <span>60 minutes ago</span>
              <span>Now</span>
            </div>
          </div>

          {top.length > 0 ? (
            <ul className="border-t border-line">
              {top.map(({ row, t }) => {
                const share = errorRate(t);
                return (
                  <li key={row.project.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                    <ProjectIcon projectId={row.project.id} version={row.lastDeployment?.id} running={row.status.kind === "live"} size={24} />
                    <p className="min-w-0 flex-1 truncate text-[13px]">{displayName(row)}</p>
                    {share !== null && share > 0 && <span className="text-xs text-danger">{formatPercent(share)}</span>}
                    <span className="w-10 text-right text-[13px] tabular-nums text-muted">{compactNumber(t.total_requests)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="border-t border-line p-4 text-[13px] leading-relaxed text-muted">
              No requests yet. Open a project&rsquo;s address and it shows up here.
            </p>
          )}

          <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-faint">
            Counted by Hatch&rsquo;s proxy since{" "}
            {traffic.since
              ? new Date(traffic.since).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
              : "it started"}
            . The counts reset when Hatch restarts.
          </p>
        </>
      )}
    </Panel>
  );
}
