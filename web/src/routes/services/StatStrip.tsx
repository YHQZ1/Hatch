import { MetricCard } from "@/components/ui";
import type { ServiceStats } from "./useServiceRows";

const GRID =
  "mb-8 grid grid-cols-2 divide-x divide-line rounded-hatch border border-line-strong bg-base md:grid-cols-4 [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-line md:[&>*:nth-child(n+3)]:border-t-0";

/**
 * The four counts at the top of Overview and Services. While the first answer
 * is on its way it holds the strip's space, so the page below does not jump
 * when the numbers arrive.
 */
export default function StatStrip({
  stats,
  loading,
  expectServices,
  failedLabel,
}: {
  stats: ServiceStats;
  loading: boolean;
  /** Whether there were services last time; with none, nothing is reserved. */
  expectServices: boolean;
  failedLabel: string;
}) {
  if (loading) {
    if (!expectServices) return null;
    return (
      <div className={GRID} aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="px-5 py-5">
            <div className="mb-2 h-4 w-16 animate-pulse rounded-hatch bg-line" />
            <div className="h-8 w-10 animate-pulse rounded-hatch bg-line/70" />
          </div>
        ))}
      </div>
    );
  }
  if (stats.total === 0) return null;

  return (
    <div className={GRID}>
      <Cell><MetricCard label="Services" value={stats.total.toString()} /></Cell>
      <Cell><MetricCard label="Live" value={stats.live.toString()} tone="success" /></Cell>
      <Cell><MetricCard label="Building" value={stats.active.toString()} tone="warning" /></Cell>
      <Cell>
        <MetricCard
          label={failedLabel}
          value={stats.failed.toString()}
          tone={stats.failed > 0 ? "danger" : "muted"}
        />
      </Cell>
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-5">{children}</div>;
}
