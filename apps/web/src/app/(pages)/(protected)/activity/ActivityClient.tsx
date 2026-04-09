"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import { PageLoadingState } from "../../../components/LoadingState";

interface ActivityEvent {
  id: string;
  type: string;
  message: string;
  created_at: string;
}

const CACHE_KEY = "hatch_activity_cache";
const CACHE_TTL = 2 * 60 * 1000;

export default function ActivityClient() {
  const router = useRouter();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("hatch_token");
    if (!token) {
      router.push("/auth");
      return;
    }

    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const cacheAge = Date.now() - (parsed.timestamp || 0);
        if (cacheAge < CACHE_TTL) {
          setEvents(parsed.data || []);
          setLoading(false);
        }
      } catch {}
    }

    const fetchData = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/activity`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const data = await res.json();
        const eventsList: ActivityEvent[] = Array.isArray(data) ? data : [];
        setEvents(eventsList);

        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            data: eventsList,
            timestamp: Date.now(),
          }),
        );
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  if (!mounted) return <PageLoadingState />;
  if (loading) return <PageLoadingState />;

  return (
    <div className="w-full min-h-screen bg-black text-white">
      <main className="w-full px-8 lg:px-10 py-8">
        <PageHeader
          title="Activity"
          description="Real-time audit trail of system events"
        />

        <div className="w-full border border-[#1a1a1a] rounded-[3px] overflow-hidden">
          <div className="w-full grid grid-cols-12 px-5 py-3 bg-[#050505] border-b border-[#1a1a1a] text-[9px] font-mono uppercase tracking-[0.18em] text-[#3a3a3a] font-bold">
            <div className="col-span-2">Timestamp</div>
            <div className="col-span-1 text-center">Type</div>
            <div className="col-span-7 px-10">Event</div>
            <div className="col-span-2 text-right">Reference</div>
          </div>

          {events.length > 0 ? (
            <div className="flex flex-col">
              {events.map((e) => (
                <div
                  key={e.id}
                  className="w-full grid grid-cols-12 px-5 py-4 items-center border-b border-[#111] hover:bg-white/[0.015] transition-colors group last:border-b-0"
                >
                  <div className="col-span-2 font-mono text-[11px] text-zinc-500">
                    {new Date(e.created_at).toLocaleTimeString([], {
                      hour12: false,
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </div>

                  <div className="col-span-1 flex justify-center">
                    <span
                      className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 border ${
                        e.type === "DELETE"
                          ? "border-zinc-800 text-zinc-700"
                          : "border-zinc-700 text-zinc-400"
                      }`}
                    >
                      {e.type}
                    </span>
                  </div>

                  <div className="col-span-7 px-10">
                    <p className="text-[13px] text-zinc-300 group-hover:text-white transition-colors tracking-tight">
                      {e.message}
                    </p>
                  </div>

                  <div className="col-span-2 text-right font-mono text-[10px] text-zinc-700">
                    {e.id.split("-")[0]}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-20 text-center">
              <p className="text-[10px] text-zinc-700 font-mono uppercase tracking-[0.35em]">
                No activity recorded
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
