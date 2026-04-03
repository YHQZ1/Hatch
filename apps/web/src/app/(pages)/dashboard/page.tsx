/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Dashboard() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("hatch_token");
    if (!token) {
      router.push("/auth");
      return;
    }

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUsername(payload.username);
    } catch {
      router.push("/auth");
    }
  }, [router]);

  if (!mounted) return <div className="min-h-screen bg-black" />;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col selection:bg-white selection:text-black">
      {/* --- EDGE-TO-EDGE HEADER --- */}
      <header className="h-14 border-b border-[#1f1f1f] bg-black flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-4 h-4 bg-white transition-transform group-hover:scale-90"></div>
            <span className="font-bold uppercase tracking-tighter text-sm">
              Hatch
            </span>
          </Link>
          <nav className="flex h-14 font-mono text-[10px] uppercase tracking-widest text-[#444]">
            <button className="px-6 border-x border-[#1f1f1f] text-white bg-[#050505]">
              Services
            </button>
            <button className="px-6 border-r border-[#1f1f1f] hover:text-white transition-colors">
              Clusters
            </button>
            <button className="px-6 border-r border-[#1f1f1f] hover:text-white transition-colors">
              Settings
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-6 font-mono text-[10px]">
          <span className="text-[#888] uppercase tracking-widest">
            {username || "user_null"}
          </span>
          <button
            onClick={() => {
              localStorage.removeItem("hatch_token");
              router.push("/");
            }}
            className="border border-[#333] px-3 py-1 hover:bg-white hover:text-black transition-all"
          >
            LOGOUT
          </button>
        </div>
      </header>

      {/* --- FULL WIDTH MAIN CONTENT --- */}
      <main className="flex-grow flex flex-col relative z-10">
        {/* Title Bar */}
        <div className="flex items-center justify-between px-6 py-8 border-b border-[#1f1f1f]">
          <div className="space-y-1">
            <h1 className="text-3xl font-medium tracking-tighter">
              Active_Deployment_Fleet
            </h1>
            <p className="text-[#333] font-mono text-[9px] uppercase tracking-[0.3em]">
              Environment: Production // Cluster: us-east-1
            </p>
          </div>
          <button className="h-10 px-8 bg-white text-black text-[10px] font-bold uppercase tracking-widest hover:bg-[#e5e5e5] transition-colors">
            Deploy New Service
          </button>
        </div>

        {/* Edge-to-Edge Grid Section */}
        <div className="flex flex-grow flex-col lg:flex-row bg-[#000]">
          {/* Main List Column */}
          <div className="flex-grow border-r border-[#1f1f1f]">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <DashServiceItem
                name="Hatch-Core-API"
                status="Active"
                cpu="14%"
                ram="512MB"
              />
              <DashServiceItem
                name="Hatch-Builder-Node"
                status="Active"
                cpu="02%"
                ram="1GB"
              />
              <DashServiceItem
                name="Hatch-Auth-Gateway"
                status="Active"
                cpu="08%"
                ram="256MB"
              />
              <div className="p-12 border-b border-r border-[#1f1f1f] flex items-center justify-center group cursor-pointer hover:bg-[#050505] transition-colors">
                <span className="font-mono text-[9px] text-[#222] uppercase tracking-[0.5em] group-hover:text-[#888]">
                  Add_Component
                </span>
              </div>
            </div>
          </div>

          {/* Right Sidebar Status */}
          <div className="w-full lg:w-96 flex flex-col bg-[#050505]">
            <div className="p-6 border-b border-[#1f1f1f]">
              <span className="font-mono text-[10px] text-[#444] uppercase tracking-widest block mb-6">
                Global_Network_Status
              </span>
              <div className="space-y-4">
                <HealthStat label="API_ENDPOINT" val="UP" />
                <HealthStat label="DOCKER_REGISTRY" val="UP" />
                <HealthStat label="LOAD_BALANCER" val="STABLE" />
                <HealthStat label="DB_CLUSTER" val="SYNC" />
              </div>
            </div>

            <div className="p-6 flex-grow">
              <span className="font-mono text-[10px] text-[#444] uppercase tracking-widest block mb-4">
                Infrastructure_Log
              </span>
              <div className="font-mono text-[9px] text-[#222] space-y-1">
                <p>&gt; sys_update: complete</p>
                <p>&gt; node_01: handshake_ok</p>
                <p>&gt; traffic: nominal</p>
                <p>&gt; 12:44:01 - audit_log_rotated</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function DashServiceItem({
  name,
  status,
  cpu,
  ram,
}: {
  name: string;
  status: string;
  cpu: string;
  ram: string;
}) {
  return (
    <div className="p-10 border-b border-r border-[#1f1f1f] hover:bg-[#050505] transition-all group cursor-pointer relative overflow-hidden">
      <div className="flex justify-between items-start mb-10">
        <div className="space-y-1">
          <h3 className="text-xl font-bold tracking-tighter uppercase">
            {name}
          </h3>
          <span className="font-mono text-[9px] text-[#333] uppercase border border-[#111] px-1">
            {status}
          </span>
        </div>
        <div className="w-2 h-2 bg-white"></div>
      </div>

      <div className="grid grid-cols-2 gap-8 pt-6 border-t border-[#111]">
        <div className="space-y-1">
          <span className="font-mono text-[8px] text-[#222] uppercase tracking-widest block">
            Compute_Load
          </span>
          <span className="font-mono text-xs text-[#888]">{cpu}</span>
        </div>
        <div className="space-y-1">
          <span className="font-mono text-[8px] text-[#222] uppercase tracking-widest block">
            Memory_Alloc
          </span>
          <span className="font-mono text-xs text-[#888]">{ram}</span>
        </div>
      </div>
    </div>
  );
}

function HealthStat({ label, val }: { label: string; val: string }) {
  return (
    <div className="flex justify-between items-center pb-2 border-b border-[#111]">
      <span className="font-mono text-[9px] text-[#333] uppercase">
        {label}
      </span>
      <span className="font-mono text-[9px] text-white">{val}</span>
    </div>
  );
}
