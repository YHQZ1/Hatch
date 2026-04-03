/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

export default function AuthPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="min-h-screen bg-black" />;

  return (
    <div className="min-h-screen w-full bg-[#000] text-white flex flex-col relative overflow-hidden selection:bg-white selection:text-black font-sans">
      {/* --- SHARED BACKGROUND GRID --- */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid-pattern opacity-10 [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]"></div>
        <div className="absolute left-[40%] top-0 bottom-0 w-px bg-[#1f1f1f]"></div>
        <div className="absolute top-[30%] left-0 right-0 h-px bg-[#1f1f1f]"></div>
      </div>

      {/* --- HEADER --- */}
      <header className="relative z-20 p-8 lg:p-12 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-3 group px-12">
          <div className="w-10 h-10 bg-white flex items-center justify-center transition-transform duration-300">
            <div className="w-4 h-4 bg-black"></div>
          </div>
          <span className="font-bold tracking-tighter text-5xl uppercase">
            Hatch
          </span>
        </Link>
        <Link
          href="/"
          className="font-mono text-[12px] text-[#444] hover:text-white transition-colors uppercase tracking-[0.2em]"
        >
          [ Go Back ]
        </Link>
      </header>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="relative z-10 flex-grow flex flex-col lg:flex-row items-center px-8 lg:px-24">
        {/* Left Side: Auth Form */}
        <div className="w-full lg:w-[450px] flex flex-col gap-10 py-12 lg:py-0">
          <div className="space-y-4">
            <h1 className="text-5xl lg:text-7xl font-medium tracking-tighter leading-[0.8] mb-4">
              Identify <br /> User.
            </h1>
            <p className="text-[#888] text-base font-light leading-relaxed max-w-sm">
              Sign in or create an account to start deploying your services to
              the cloud.
            </p>
          </div>

          <div className="flex flex-col gap-8">
            <div className="grid grid-cols-2 gap-px bg-[#1f1f1f] border border-[#1f1f1f]">
              <button className="flex items-center justify-center gap-3 py-4 bg-black hover:bg-white hover:text-black transition-all group">
                <img
                  src="https://cdn.simpleicons.org/github/FFFFFF"
                  alt="GitHub"
                  className="w-4 h-4 group-hover:invert transition-all"
                />
                <span className="font-mono text-[9px] uppercase tracking-widest font-bold">
                  GitHub
                </span>
              </button>
              <button className="flex items-center justify-center gap-3 py-4 bg-black hover:bg-white hover:text-black transition-all group">
                <img
                  src="https://cdn.simpleicons.org/gitlab/FC6D26"
                  alt="GitLab"
                  className="w-4 h-4 group-hover:grayscale transition-all"
                />
                <span className="font-mono text-[9px] uppercase tracking-widest font-bold text-[#888] group-hover:text-black">
                  GitLab
                </span>
              </button>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="font-mono text-[9px] uppercase text-[#333] tracking-[0.3em] whitespace-nowrap">
                  Email Login
                </span>
                <div className="h-px w-full bg-[#111]"></div>
              </div>
              <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                <div className="space-y-px bg-[#1f1f1f] border border-[#1f1f1f]">
                  <input
                    type="email"
                    placeholder="Email Address"
                    className="w-full h-12 bg-black px-4 text-sm focus:bg-[#0a0a0a] outline-none transition-colors placeholder-[#444] border-b border-[#1f1f1f]"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    className="w-full h-12 bg-black px-4 text-sm focus:bg-[#0a0a0a] outline-none transition-colors placeholder-[#444]"
                  />
                </div>
                <button className="w-full h-14 bg-white text-black font-bold text-xs uppercase tracking-[0.2em] hover:bg-[#e5e5e5] transition-colors">
                  Continue
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* --- RIGHT SIDE: INFRASTRUCTURE SLICE (NEW VISUAL) --- */}
        <div className="hidden lg:flex flex-grow justify-end h-[600px]">
          <div className="w-[550px] border border-[#1f1f1f] bg-[#050505]/50 flex flex-col relative overflow-hidden">
            {/* Top Bar: Cluster Info */}
            <div className="p-6 border-b border-[#1f1f1f] flex justify-between items-center bg-black/40">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-white animate-pulse"></div>
                <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white">
                  Production_Cluster_01
                </span>
              </div>
              <span className="font-mono text-[9px] text-[#444] uppercase tracking-widest">
                Region: US-EAST-1
              </span>
            </div>

            <div className="flex flex-grow">
              {/* Column 1: Deployment Pipelines (Vertical Activity) */}
              <div className="w-1/3 border-r border-[#1f1f1f] p-6 flex flex-col gap-4 overflow-hidden relative">
                <span className="font-mono text-[9px] text-[#333] uppercase tracking-widest block mb-2">
                  Live_Pipelines
                </span>
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="space-y-2 opacity-80">
                    <div className="flex justify-between font-mono text-[8px] text-[#444]">
                      <span>P-{100 + i}</span>
                      <span className="text-[#10b981]">OK</span>
                    </div>
                    <div className="h-[2px] bg-[#111] relative overflow-hidden">
                      <div
                        className="absolute inset-0 bg-white/40 animate-progress"
                        style={{
                          animationDelay: `${i * 0.5}s`,
                          animationDuration: "3s",
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#050505] to-transparent pointer-events-none"></div>
              </div>

              {/* Column 2: Network Heatmap & Traffic */}
              <div className="flex-grow p-8 flex flex-col justify-between relative bg-black/20">
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-[9px] text-[#333] uppercase tracking-widest">
                      Global_Edge_Network
                    </span>
                    <span className="font-mono text-[10px] text-[#888]">
                      12.4K req/s
                    </span>
                  </div>

                  {/* THE HEATMAP GRID */}
                  <div className="grid grid-cols-12 gap-1 w-full">
                    {[...Array(120)].map((_, i) => (
                      <ActivityPip key={i} />
                    ))}
                  </div>
                </div>

                {/* Industrial Watermark */}
                <div className="absolute bottom-4 right-8 text-right opacity-10 select-none pointer-events-none">
                  <div className="text-6xl font-bold leading-none">HATCH</div>
                  <div className="font-mono text-[10px] tracking-[0.5em] mt-2">
                    DEPLOYMENT_ENGINE
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Telemetry: Resource Readout */}
            <div className="p-8 border-t border-[#1f1f1f] bg-black/40 grid grid-cols-3 gap-8">
              <TelemetryStat label="CPU_CORE_01" value="32%" />
              <TelemetryStat label="RAM_ALLOC" value="1.2GB" />
              <TelemetryStat label="I/O_SPEED" value="840MB/S" />
            </div>
          </div>
        </div>
      </main>

      <style jsx global>{`
        @keyframes progress {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        .animate-progress {
          animation: progress linear infinite;
        }
      `}</style>
    </div>
  );
}

function ActivityPip() {
  // Logic for a single heatmap "node"
  const [active, setActive] = useState(false);

  useEffect(() => {
    const interval = setInterval(
      () => {
        setActive(Math.random() > 0.85);
      },
      1000 + Math.random() * 2000,
    );
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={`aspect-square border border-white/[0.03] transition-colors duration-700 ${active ? "bg-white/40" : "bg-white/[0.03]"}`}
    ></div>
  );
}

function TelemetryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <span className="font-mono text-[8px] text-[#333] uppercase tracking-widest block">
        {label}
      </span>
      <div className="flex items-end gap-2">
        <span className="font-mono text-xs text-white leading-none">
          {value}
        </span>
        <div className="flex-grow h-[1px] bg-[#111] mb-1"></div>
      </div>
    </div>
  );
}
