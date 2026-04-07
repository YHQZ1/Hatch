/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";

export default function ActivityClient() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
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
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="h-screen bg-black" />;

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white selection:text-black">
      {/* HEADER: Simple & Clean */}
      <header className="w-full border-b border-white/5 px-8 py-10">
        <h1 className="text-5xl font-medium tracking-tight">Recent Activity</h1>
      </header>

      {/* THE LIST: Full Width Grid */}
      <main className="w-full">
        {/* Table Header Labels */}
        <div className="w-full grid grid-cols-12 px-8 py-4 border-b border-white/5 bg-white/[0.02] text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-600">
          <div className="col-span-2">Timestamp</div>
          <div className="col-span-1 text-center">Type</div>
          <div className="col-span-7 px-10">Event Message</div>
          <div className="col-span-2 text-right">Reference ID</div>
        </div>

        {events.length > 0 ? (
          <div className="flex flex-col">
            {events.map((e) => (
              <div
                key={e.id}
                className="w-full grid grid-cols-12 px-8 py-6 items-center border-b border-white/[0.03] hover:bg-white/[0.01] transition-colors group"
              >
                {/* 1. TIME */}
                <div className="col-span-2 font-mono text-[11px] text-zinc-500">
                  {new Date(e.created_at).toLocaleTimeString([], {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </div>

                {/* 2. TYPE */}
                <div className="col-span-1 flex justify-center">
                  <span
                    className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 border ${e.type === "DELETE" ? "border-zinc-800 text-zinc-700" : "border-zinc-700 text-zinc-400"}`}
                  >
                    {e.type}
                  </span>
                </div>

                {/* 3. MESSAGE */}
                <div className="col-span-7 px-10">
                  <p className="text-[14px] text-zinc-300 group-hover:text-white transition-colors tracking-tight">
                    {e.message}
                  </p>
                </div>

                {/* 4. ID */}
                <div className="col-span-2 text-right font-mono text-[10px] text-zinc-700">
                  {e.id.split("-")[0]}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center text-zinc-800 font-mono text-xs uppercase tracking-widest">
            No system activity recorded.
          </div>
        )}
      </main>

      <footer className="p-8 text-[9px] font-mono text-zinc-900 uppercase tracking-widest">
        End of Audit Trail
      </footer>
    </div>
  );
}
