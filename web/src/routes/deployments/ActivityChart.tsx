import { Panel } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { FeedItem } from "../services/useDeploymentFeed";
import { formatPercent } from "../overview/overview";
import { bucketsByDay, dayKey, formatDuration, medianDuration, successRate, type DayBucket } from "./deployments";

/** How many days the chart covers. */
export const CHART_DAYS = 14;

const CHART_HEIGHT = 64;

/**
 * The last two weeks of deployments, a bar a day split by outcome, with the
 * three numbers that summarise them: how many, how often they succeeded, and
 * how long a successful one usually takes.
 */
export default function ActivityChart({
  items,
  now,
  loading,
  className,
}: {
  items: FeedItem[];
  now: Date;
  loading: boolean;
  className?: string;
}) {
  const buckets = bucketsByDay(items, CHART_DAYS, now);
  const total = buckets.reduce((sum, b) => sum + b.total, 0);
  const rate = successRate(buckets);
  const median = medianDuration(
    items.filter(({ deployment }) => buckets.some((b) => b.key === dayKey(new Date(deployment.created_at)))),
  );
  const max = Math.max(1, ...buckets.map((b) => b.total));

  return (
    <Panel className={cn("px-5 py-4", className)}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:gap-10">
        <dl className="grid shrink-0 grid-cols-3 gap-6 lg:w-[380px]">
          <Stat label="Deployments" value={loading ? "–" : String(total)} note="last 14 days" />
          <Stat label="Success rate" value={loading ? "–" : rate === null ? "—" : formatPercent(rate)} note="of finished" />
          <Stat label="Median build" value={loading ? "–" : median === null ? "—" : formatDuration(median)} note="successful" />
        </dl>

        <div className="min-w-0 flex-1">
          <div
            role="img"
            aria-label={`Deployments per day over the last ${CHART_DAYS} days: ${total} in total`}
            className="flex items-end gap-1.5"
            style={{ height: CHART_HEIGHT }}
          >
            {buckets.map((bucket) => (
              <Bar key={bucket.key} bucket={bucket} max={max} loading={loading} />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-faint">
            <span>{buckets[0]?.label.replace(/^\w+, /, "")}</span>
            <span className="hidden sm:inline">{CHART_DAYS} days</span>
            <span>Today</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0">
      <dd className="truncate text-xl font-semibold leading-8 tabular-nums tracking-tight sm:text-2xl">{value}</dd>
      <dt className="text-[13px] text-muted">{label}</dt>
      <p className="text-xs text-faint">{note}</p>
    </div>
  );
}

/** One day: its segments stacked from the bottom, succeeded first. */
function Bar({ bucket, max, loading }: { bucket: DayBucket; max: number; loading: boolean }) {
  const height = (count: number) => `${(count / max) * 100}%`;
  const parts = [
    bucket.succeeded && `${bucket.succeeded} succeeded`,
    bucket.failed && `${bucket.failed} failed`,
    bucket.canceled && `${bucket.canceled} canceled`,
    bucket.building && `${bucket.building} in progress`,
  ].filter(Boolean);
  const title =
    bucket.total === 0
      ? `${bucket.label}: no deployments`
      : `${bucket.label}: ${bucket.total} deployment${bucket.total === 1 ? "" : "s"} (${parts.join(", ")})`;

  return (
    <div title={title} className="flex h-full flex-1 flex-col justify-end gap-px">
      {loading || bucket.total === 0 ? (
        <span className={cn("h-0.5 rounded-[1px] bg-line-strong", loading && "animate-pulse")} />
      ) : (
        <>
          {bucket.building > 0 && <span style={{ height: height(bucket.building) }} className="min-h-[2px] rounded-[1px] bg-warning" />}
          {bucket.failed > 0 && <span style={{ height: height(bucket.failed) }} className="min-h-[2px] rounded-[1px] bg-danger" />}
          {bucket.canceled > 0 && <span style={{ height: height(bucket.canceled) }} className="min-h-[2px] rounded-[1px] bg-faint" />}
          {bucket.succeeded > 0 && <span style={{ height: height(bucket.succeeded) }} className="min-h-[2px] rounded-[1px] bg-success" />}
        </>
      )}
    </div>
  );
}
