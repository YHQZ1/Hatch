import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { formatElapsed } from "../overview/overview";
import { type StateInfo, formatDuration } from "./deployments";

const DOT: Record<StateInfo["state"], string> = {
  current: "bg-success",
  replaced: "bg-success",
  building: "animate-pulse bg-warning",
  failed: "bg-danger",
  canceled: "bg-faint",
  other: "bg-faint",
};

const TEXT: Record<StateInfo["state"], string> = {
  current: "text-ink",
  replaced: "text-ink",
  building: "text-warning",
  failed: "text-danger",
  canceled: "text-muted",
  other: "text-muted",
};

/**
 * How a deployment stands: a dot, the word (Ready, Building, Failed, Canceled)
 * and how long it took, or how long it has been running so far. Only the
 * status is coloured; nothing around it is.
 */
export default function StatusLine({
  info,
  startedAt,
  seconds,
  detail,
  className,
}: {
  info: StateInfo;
  startedAt: Date;
  /** How long it took, once it has ended. */
  seconds: number | null;
  /** Shown on hover, such as why a build failed. */
  detail?: string;
  className?: string;
}) {
  const running = info.state === "building";
  return (
    <span className={cn("flex items-center gap-2 whitespace-nowrap text-[13px]", className)} title={detail || undefined}>
      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", DOT[info.state])} />
      <span className={cn("font-medium", TEXT[info.state])}>{info.label}</span>
      <span className="tabular-nums text-muted">
        {running ? <Elapsed since={startedAt.getTime()} /> : seconds === null ? "" : formatDuration(seconds)}
      </span>
    </span>
  );
}

function Elapsed({ since }: { since: number }) {
  return <>{formatElapsed(useNow() - since)}</>;
}
