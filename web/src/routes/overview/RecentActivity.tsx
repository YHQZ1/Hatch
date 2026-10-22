import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { NO_ACTIVITY, activityQuery } from "@/lib/queries";
import { activityKind, activityMeta } from "../services/activity";
import { formatRelativeTime } from "../services/service";

const SHOWN = 6;

/** The latest few things that happened, with a link to the full trail. */
export default function RecentActivity() {
  const result = useQuery(activityQuery());
  const events = (result.data ?? NO_ACTIVITY).slice(0, SHOWN);

  return (
    <section className="rounded-hatch border border-line-strong bg-base">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
        <h2 className="text-[1rem] font-semibold tracking-tight">Recent activity</h2>
        <Link to="/activity" className="text-sm text-muted transition-colors hover:text-ink">
          View all
        </Link>
      </div>

      {result.isPending ? (
        <div className="space-y-4 px-5 py-5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-3 animate-pulse rounded-hatch bg-line" style={{ opacity: 1 - i * 0.25 }} />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="px-5 py-6 text-sm leading-relaxed text-muted">
          Nothing yet. Creating, deploying and deleting services shows up here.
        </p>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id} className="flex items-start gap-3 border-b border-line px-5 py-3.5 last:border-b-0">
              <span
                aria-hidden
                className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${activityMeta(activityKind(event.type)).dot}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">{event.message}</p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
                  {formatRelativeTime(event.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
