import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/cn";
import { safeHttpUrl } from "@/lib/url";
import type { Deployment } from "@/lib/types";
import type { LogLine } from "./logs";

const TEXT: Record<LogLine["type"], string> = {
  success: "text-success",
  error: "text-danger",
  system: "font-medium text-ink",
  muted: "text-muted",
};

/** How close to the end (in pixels) still counts as following the log. */
const FOLLOW_MARGIN = 48;

/**
 * A deployment's log: numbered lines in a scrolling box. It follows new lines
 * while you are at the end and stays put once you scroll up to read. Only the
 * box scrolls, never the page. Give it a `key` per deployment.
 */
export default function LogViewer({
  deployment,
  logs,
  running,
  className,
  showId = true,
}: {
  deployment: Deployment | null;
  logs: LogLine[];
  running: boolean;
  /** Replaces the box's default height. */
  className?: string;
  /** Name the deployment in the heading; leave it out where the page already does. */
  showId?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    const el = box.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  useEffect(() => {
    if (copy === "idle") return;
    const timer = window.setTimeout(() => setCopy("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copy]);

  const onCopy = async () => {
    setCopy((await copyText(logs.map((line) => line.text).join("\n"))) ? "copied" : "failed");
  };

  return (
    <section aria-label="Logs" className="min-w-0">
      <div className="mb-3 flex min-h-9 items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="text-[1rem] font-semibold tracking-tight">Logs</h2>
          {deployment && (
            <span className="truncate text-sm text-muted">
              {showId ? `${deployment.id.slice(0, 8)} · ` : ""}{count(logs)}
            </span>
          )}
        </div>
        <Button variant="secondary" onClick={onCopy} disabled={logs.length === 0}>
          {copy === "copied" ? "Copied" : copy === "failed" ? "Copy failed" : "Copy logs"}
        </Button>
      </div>

      <div
        ref={box}
        onScroll={() => {
          const el = box.current;
          if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_MARGIN;
        }}
        className={cn("h-[520px] overflow-y-auto rounded-hatch border border-line-strong bg-panel py-2 font-mono text-xs", className)}
      >
        {logs.length === 0 ? (
          <p className="flex h-full items-center justify-center px-6 text-center font-sans text-sm text-muted">
            {!deployment
              ? "Deploy this project and its build log appears here."
              : running
                ? "Waiting for output…"
                : "No log was kept for this deployment."}
          </p>
        ) : (
          logs.map((line, index) => (
            <div key={index} className="grid grid-cols-[3.25rem_minmax(0,1fr)] px-1 leading-relaxed hover:bg-ink/[0.03]">
              <span className="select-none pr-3 text-right tabular-nums text-faint">{line.seq}</span>
              <p className={cn("whitespace-pre-wrap break-words pr-3", TEXT[line.type])}>{withLinks(line.text)}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/** "12 lines", or, when the oldest were let go, how many there were and how many are shown. */
function count(logs: LogLine[]) {
  const total = logs.length === 0 ? 0 : logs[logs.length - 1].seq;
  const noun = total === 1 ? "line" : "lines";
  return total > logs.length ? `${total} lines, the last ${logs.length} shown` : `${total} ${noun}`;
}

/** The line's text with any address in it made a link. */
function withLinks(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
    const href = i % 2 === 1 ? safeHttpUrl(part) : null;
    return href ? (
      <a
        key={i}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-current/30 underline-offset-2 hover:decoration-current"
      >
        {part}
      </a>
    ) : (
      part
    );
  });
}
