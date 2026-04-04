/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Navbar from "@/app/components/Navbar";

export default function ProfilePage() {
  const [user, setUser] = useState<{
    username: string;
    avatar?: string;
  } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("hatch_token");
    if (token) {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUser({
        username: payload.username,
        avatar:
          payload.avatar_url || `https://github.com/${payload.username}.png`,
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-white font-sans selection:bg-white selection:text-black">
      <Navbar />

      <main className="max-w-[1400px] mx-auto px-8 lg:px-12 py-20">
        <div className="flex flex-col md:flex-row items-center gap-12 mb-20 pb-12 border-b border-[var(--border)]">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-tr from-white/20 to-transparent rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-md"></div>
            <img
              src={user?.avatar}
              className="w-32 h-32 md:w-48 md:h-48 rounded-full border-2 border-[var(--border)] relative z-10 grayscale hover:grayscale-0 transition-all duration-700"
              alt="Avatar"
            />
          </div>

          <div className="space-y-4 text-center md:text-left">
            <div className="space-y-1">
              <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-[0.4em]">
                Operator_Identity
              </p>
              <h1 className="text-5xl md:text-7xl font-medium tracking-tighter uppercase">
                {user?.username}
              </h1>
            </div>
            <div className="flex flex-wrap justify-center md:justify-start gap-4">
              <Badge label="GitHub Connected" />
              <Badge label="Root Access" />
              <Badge label="AP-SOUTH-1" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          <div className="lg:col-span-4 space-y-12">
            <div className="space-y-6">
              <h3 className="font-mono text-[11px] text-white uppercase tracking-widest border-b border-[var(--border)] pb-4">
                Security_Parameters
              </h3>
              <IdentityField
                label="Authentication"
                value="OAuth_2.0 / GitHub"
              />
              <IdentityField
                label="Access Level"
                value="System_Administrator"
              />
              <IdentityField label="Session Token" value="RSA_4096_GCM" />
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="border border-[var(--border)] bg-[#050505] p-10 space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-[11px] text-white uppercase tracking-widest">
                  Recent_Telemetry
                </h3>
                <span className="font-mono text-[9px] text-[#333]">
                  Last 24 Hours
                </span>
              </div>

              <div className="space-y-px bg-[var(--border)]">
                <ActivityRow
                  action="DEPLOY_INITIALIZED"
                  target="hatch-api-gateway"
                  time="2h ago"
                />
                <ActivityRow
                  action="CONFIG_MODIFIED"
                  target="production-cluster"
                  time="5h ago"
                />
                <ActivityRow
                  action="SESSION_STARTED"
                  target="operator-console"
                  time="8h ago"
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="px-3 py-1 border border-[var(--border)] bg-[var(--surface)] font-mono text-[9px] text-[var(--text-muted)] uppercase tracking-widest">
      {label}
    </span>
  );
}

function IdentityField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-[9px] text-[#333] uppercase tracking-widest">
        {label}
      </p>
      <p className="text-sm font-medium tracking-tight text-[#ccc]">{value}</p>
    </div>
  );
}

function ActivityRow({
  action,
  target,
  time,
}: {
  action: string;
  target: string;
  time: string;
}) {
  return (
    <div className="bg-black p-4 flex items-center justify-between group hover:bg-[#080808] transition-colors">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] text-white tracking-widest group-hover:text-[var(--success)] transition-colors">
          {action}
        </span>
        <span className="font-mono text-[9px] text-[#333] uppercase">
          {target}
        </span>
      </div>
      <span className="font-mono text-[9px] text-[#333]">{time}</span>
    </div>
  );
}
