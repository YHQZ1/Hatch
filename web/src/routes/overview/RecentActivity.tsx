import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/ui";
import { NO_ACTIVITY, activityQuery } from "@/lib/queries";
import { activityKind, activityMeta } from "../services/activity";
import { formatRelativeTime } from "../services/service";
import PanelHeader from "./PanelHeader";

const SHOWN = 6;

/** The latest few things that happened, with a link to the full trail. */
export default function RecentActivity({ className }: { className?: string }) {
  const result = useQuery(activityQuery());
  const events = (result.data ?? NO_ACTIVITY).slice(0, SHOWN);

  return (
    <Panel className={className}>
      <PanelHeader title="Recent activity" link={{ label: "View all", href: "/activity" }} />

      {result.isPending ? (
        <div className="space-y-4 p-4" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-3 animate-pulse rounded-hatch bg-line" style={{ opacity: 1 - i * 0.25 }} />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="p-4 text-[13px] leading-relaxed text-muted">
          Nothing yet. Creating, deploying and deleting services shows up here.
        </p>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id} className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <span
                aria-hidden
                className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${activityMeta(activityKind(event.type)).dot}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug">{event.message}</p>
                <p className="mt-0.5 text-xs text-faint">
                  {formatRelativeTime(event.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
