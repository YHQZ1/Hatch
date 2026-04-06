"use client";

import { useEffect, useState } from "react";

interface ActivityLog {
  id: string;
  type: string;
  message: string;
  created_at: string;
}

export default function ActivityClient() {
  const [events, setEvents] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      const token = localStorage.getItem("hatch_token");
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/activity`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const data = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to fetch activity:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
  }, []);

  // Helper to format "2 minutes ago" style
  const timeAgo = (dateString: string) => {
    const now = new Date();
    const past = new Date(dateString);
    const diffInMs = now.getTime() - past.getTime();

    const minutes = Math.floor(diffInMs / (1000 * 60));
    const hours = Math.floor(diffInMs / (1000 * 60 * 60));
    const days = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="p-10 max-w-[1200px] mx-auto">
        <p className="text-[10px] font-mono text-neutral-600 animate-pulse">
          SYNCING_AUDIT_TRAIL...
        </p>
      </div>
    );
  }

  return (
    <div className="p-10 max-w-[1200px] mx-auto space-y-12">
      <header className="space-y-2">
        <p className="text-[10px] font-mono text-neutral-600 uppercase tracking-[0.4em]">
          Audit Trail
        </p>
        <h1 className="text-6xl font-bold text-white tracking-tighter uppercase leading-none">
          Activity
        </h1>
      </header>

      <div className="divide-y divide-[#1a1a1a] border-t border-[#1a1a1a]">
        {events.length > 0 ? (
          events.map((e) => (
            <div
              key={e.id}
              className="py-8 grid grid-cols-[100px_1fr_100px] items-center gap-8 group"
            >
              <span
                className={`text-[9px] font-mono uppercase tracking-widest border px-2 py-1 transition-colors ${
                  e.type === "DELETE"
                    ? "border-red-900/50 text-red-500"
                    : e.type === "CREATE"
                      ? "border-emerald-900/50 text-emerald-500"
                      : "border-neutral-900 text-neutral-600"
                }`}
              >
                {e.type}
              </span>
              <div className="space-y-1">
                <p className="text-[15px] font-medium text-white tracking-tight">
                  {e.message}
                </p>
                <p className="text-[10px] text-neutral-600 font-mono uppercase italic">
                  System Event
                </p>
              </div>
              <span className="text-[11px] text-neutral-700 font-mono text-right">
                {timeAgo(e.created_at)}
              </span>
            </div>
          ))
        ) : (
          <div className="py-20 text-center">
            <p className="text-zinc-600 font-mono text-xs uppercase tracking-widest">
              No activity recorded yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
