"use client";

export default function ActivityClient() {
  const events = [
    {
      id: 1,
      type: "DEPLOY",
      msg: "Production build of BitLink started",
      time: "2m ago",
      user: "uttkarsh",
    },
    {
      id: 2,
      type: "DELETE",
      msg: "Infrastructure for Test-App destroyed",
      time: "1h ago",
      user: "system",
    },
    {
      id: 3,
      type: "CONFIG",
      msg: "Environment variables updated for Raveline",
      time: "4h ago",
      user: "uttkarsh",
    },
  ];

  return (
    <div className="p-10 max-w-[1200px] mx-auto space-y-12">
      <header className="space-y-2 text-center md:text-left">
        <p className="text-[10px] font-mono text-neutral-600 uppercase tracking-[0.4em]">
          Audit Trail
        </p>
        <h1 className="text-6xl font-bold text-white tracking-tighter uppercase leading-none">
          Activity
        </h1>
      </header>

      <div className="divide-y divide-[#1a1a1a] border-t border-[#1a1a1a]">
        {events.map((e) => (
          <div
            key={e.id}
            className="py-8 grid grid-cols-[100px_1fr_100px] items-center gap-8 group"
          >
            <span className="text-[9px] font-mono text-neutral-700 uppercase tracking-widest border border-neutral-900 px-2 py-1 group-hover:border-neutral-500 transition-colors">
              {e.type}
            </span>
            <div className="space-y-1">
              <p className="text-[15px] font-medium text-white tracking-tight">
                {e.msg}
              </p>
              <p className="text-[10px] text-neutral-600 font-mono uppercase italic">
                Initiated by {e.user}
              </p>
            </div>
            <span className="text-[11px] text-neutral-700 font-mono text-right">
              {e.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
