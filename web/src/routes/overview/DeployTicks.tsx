import { Link } from "react-router";
import { cn } from "@/lib/cn";
import { deploymentPath } from "@/lib/paths";
import type { StatusKind } from "../services/service";
import { type Tick, tickSummary } from "./history";

const TICK_COLOR: Record<StatusKind, string> = {
  live: "bg-success",
  active: "animate-pulse bg-warning",
  failed: "bg-danger",
  canceled: "bg-faint",
  deleting: "bg-warning",
  suspended: "bg-faint",
  idle: "bg-line-strong",
};

/**
 * A project's recent deployments as a row of marks, oldest to newest, coloured
 * by outcome. Each mark opens that deployment. They are skipped by the Tab key
 * (the project page lists the same deployments), and the strip reads as one
 * sentence to a screen reader.
 */
export default function DeployTicks({
  ticks,
  slots = 16,
}: {
  ticks: Tick[];
  /** How many marks fit; unused slots are drawn empty so the strip keeps its width. */
  slots?: number;
}) {
  const empty = Math.max(0, slots - ticks.length);
  return (
    <div role="img" aria-label={tickSummary(ticks)} className="flex h-4 items-end gap-[3px]">
      {Array.from({ length: empty }, (_, i) => (
        <span key={`empty-${i}`} aria-hidden className="h-full w-1.5 rounded-[1px] bg-line/70" />
      ))}
      {ticks.map((tick) => (
        <Link
          key={tick.id}
          to={deploymentPath(tick)}
          tabIndex={-1}
          title={tick.title}
          aria-hidden
          className={cn(
            "pointer-events-auto h-full w-1.5 rounded-[1px] transition-opacity hover:opacity-70",
            TICK_COLOR[tick.kind],
          )}
        />
      ))}
    </div>
  );
}
