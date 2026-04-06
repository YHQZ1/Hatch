/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Deployment {
  id: string;
  cpu: number;
  memory_mb: number;
  subdomain: string;
}

export default function InfrastructureClient() {
  const [deployments, setProjects] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("hatch_token");
    if (!token) return;

    const fetchData = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/projects`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const projects = await res.json();

        const dPromises = projects.map((p: any) =>
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${p.id}/deployments`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          ).then((r) => r.json()),
        );

        const allD = await Promise.all(dPromises);
        setProjects(allD.flat());
        setLoading(false);
      } catch (err) {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (!mounted) return null;

  const totalRAM = deployments.reduce((acc, d) => acc + (d.memory_mb || 0), 0);

  return (
    <div className="w-full min-h-screen bg-black text-white selection:bg-white selection:text-black">
      <main className="px-6 lg:px-10 py-10 space-y-8">
        <section className="relative w-full h-[550px] border border-[#1a1a1a] bg-[#050505] rounded-[2px] overflow-hidden flex items-center justify-center">
          <div className="absolute inset-0 opacity-[0.05] bg-grid-pattern z-10 pointer-events-none" />

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <img
              src="/map.svg"
              alt="Network Map"
              className="w-full h-full object-contain opacity-10 filter invert brightness-[0.1]"
              style={{
                transform: "scale(5.5) translateX(-6.5%) translateY(5.5%)",
              }}
            />
          </div>

          {/* MUMBAI NODE FOCUS - CENTERED ON INDIA */}
          <div className="relative z-20 translate-x-[60px] translate-y-[-20px]">
            <div className="flex flex-col items-center">
              <div className="relative flex items-center justify-center cursor-pointer group">
                <div className="absolute w-24 h-24 bg-white/10 rounded-full animate-ping" />
                <div className="absolute w-12 h-12 bg-white/5 rounded-full border border-white/20 animate-pulse" />
                <div className="w-4 h-4 bg-white rounded-full shadow-[0_0_30px_white] relative z-10 transition-transform group-hover:scale-125" />
              </div>

              <div className="mt-8 bg-black/90 backdrop-blur-md border border-white/10 px-6 py-3 rounded-[2px] text-center shadow-2xl cursor-default">
                <p className="text-[12px] font-bold uppercase tracking-[0.25em] text-white mb-1">
                  Mumbai Cluster
                </p>
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">
                  ap-south-1 • Active
                </p>
              </div>
            </div>
          </div>

          <div className="absolute bottom-12 left-12 space-y-2 z-30">
            <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-[0.4em] mb-4">
              Core_Fleet_Infrastructure
            </p>
            <h1 className="text-6xl font-medium tracking-tighter uppercase text-white">
              System
            </h1>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#1a1a1a] border border-[#1a1a1a] rounded-[2px] overflow-hidden">
          <StatBox
            title="Live Instances"
            value={loading ? "..." : deployments.length}
            desc="Running container workloads"
          />
          <StatBox
            title="Resource Pool"
            value={loading ? "..." : `${totalRAM} MB`}
            desc="Total provisioned memory"
          />
          <StatBox
            title="Fleet Health"
            value="100%"
            desc="All systems nominal"
          />
        </div>

        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-[#1a1a1a] pb-5">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-600">
              Provisioned Nodes
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                Mumbai Cluster Sync
              </span>
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {loading
              ? [...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square border border-[#1a1a1a] bg-[#050505] animate-pulse rounded-[2px]"
                  />
                ))
              : deployments.map((d, i) => (
                  <div
                    key={i}
                    className="aspect-square border border-[#1a1a1a] bg-[#080808] p-6 flex flex-col justify-between hover:border-white transition-all cursor-pointer group rounded-[2px]"
                  >
                    <div className="flex justify-between items-start">
                      <div className="w-2 h-2 rounded-full bg-zinc-800 group-hover:bg-white shadow-[0_0_8px_transparent] group-hover:shadow-white transition-all" />
                      <span className="text-[9px] font-mono text-zinc-700 uppercase">
                        NODE_{i + 1}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[14px] font-medium truncate tracking-tight text-zinc-200 group-hover:text-white transition-colors">
                        {d.subdomain}
                      </p>
                      <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-tighter">
                        {d.memory_mb} MB RAM
                      </p>
                    </div>
                  </div>
                ))}
            <Link
              href="/new"
              className="aspect-square border border-dashed border-zinc-800 flex flex-col items-center justify-center hover:bg-white hover:text-black transition-all cursor-pointer group rounded-[2px]"
            >
              <span className="text-2xl font-light group-hover:scale-110 transition-transform">
                +
              </span>
              <span className="text-[9px] uppercase font-bold tracking-[0.2em] mt-2 text-center">
                Scale Fleet
              </span>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatBox({ title, value, desc }: any) {
  return (
    <div className="bg-black p-10 space-y-3 cursor-default border-r border-[#1a1a1a] last:border-r-0">
      <p className="text-[11px] font-bold text-zinc-600 uppercase tracking-[0.2em]">
        {title}
      </p>
      <p className="text-5xl font-medium tracking-tighter text-white">
        {value}
      </p>
      <p className="text-[12px] text-zinc-500 font-medium">{desc}</p>
    </div>
  );
}
