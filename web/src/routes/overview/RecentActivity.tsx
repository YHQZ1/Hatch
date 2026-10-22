import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Panel } from "@/components/ui";
import { cn } from "@/lib/cn";
import { NO_ACTIVITY, activityQuery } from "@/lib/queries";
import { activityKind, activityMeta } from "../services/activity";
import { formatRelativeTime } from "../services/service";
import PanelHeader from "./PanelHeader";

/** How many events show before the panel is opened out. */
const SHOWN = 6;

/**
 * The latest things that happened to the user's projects. It shows the newest
 * few; "View all" opens the rest (everything the server returns) in the panel
 * itself, which then scrolls.
 */
export default function RecentActivity({ className }: { className?: string }) {
  const result = useQuery(activityQuery());
  const [expanded, setExpanded] = useState(false);
  const all = result.data ?? NO_ACTIVITY;
  const events = expanded ? all : all.slice(0, SHOWN);

  return (
    <Panel className={className}>
      <PanelHeader
        title="Recent activity"
        action={
          all.length > SHOWN
            ? { label: expanded ? "Show less" : `View all ${all.length}`, onClick: () => setExpanded((v) => !v), expanded }
            : undefined
        }
      />

      {result.isPending ? (
        <div className="space-y-4 p-4" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-3 animate-pulse rounded-hatch bg-line" style={{ opacity: 1 - i * 0.25 }} />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="p-4 text-[13px] leading-relaxed text-muted">
          Nothing yet. Creating, changing and deleting projects shows up here.
        </p>
      ) : (
        <ul className={cn(expanded && "max-h-[460px] overflow-y-auto")}>
          {events.map((event) => (
            <li key={event.id} className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <span
                aria-hidden
                className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${activityMeta(activityKind(event.type)).dot}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug">{event.message}</p>
                <p className="mt-0.5 text-xs text-faint">{formatRelativeTime(event.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
