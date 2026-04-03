/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// --- TYPES ---
interface Project {
  id: string;
  repo_name: string;
  repo_url: string;
  created_at: string;
}

// --- MAIN PAGE ---
export default function Dashboard() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("hatch_token");
    if (!token) {
      router.push("/auth");
      return;
    }

    const payload = JSON.parse(atob(token.split(".")[1]));
    setUsername(payload.username);

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setProjects(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  if (!mounted) return <div className="min-h-screen bg-black" />;

  return (
    <div className="min-h-screen w-full bg-[#000] text-white flex flex-col relative overflow-x-hidden selection:bg-white selection:text-black">
      {/* Background grid */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.04]" />
      </div>

      {/* Header */}
      <header className="relative z-20 border-b border-[#1f1f1f] bg-black/80 backdrop-blur-md px-8 lg:px-12 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-6 h-6 bg-white flex items-center justify-center transition-transform duration-300 group-hover:scale-90">
              <div className="w-2.5 h-2.5 bg-black" />
            </div>
            <span className="font-bold tracking-tighter text-lg uppercase">
              Hatch
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-1">
            <span className="font-mono text-[10px] text-[#333] uppercase tracking-widest">
              / dashboard
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-[#10b981] rounded-full animate-pulse" />
            <span className="font-mono text-[10px] text-[#555] uppercase tracking-widest">
              {username ?? "—"}
            </span>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem("hatch_token");
              router.push("/");
            }}
            className="font-mono text-[10px] text-[#444] hover:text-white transition-colors uppercase tracking-[0.2em]"
          >
            [ Sign Out ]
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-grow px-8 lg:px-12 py-12">
        {/* Page title row */}
        <div className="flex items-start justify-between mb-12">
          <div className="space-y-2">
            <p className="font-mono text-[10px] text-[#333] uppercase tracking-[0.3em]">
              Control Plane
            </p>
            <h1 className="text-4xl md:text-6xl font-medium tracking-tighter leading-none">
              Projects
            </h1>
          </div>
          <Link
            href="/new"
            className="flex items-center gap-3 bg-white text-black px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-[#e5e5e5] transition-colors mt-2"
          >
            <span className="text-lg leading-none">+</span>
            New Project
          </Link>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#1f1f1f] border border-[#1f1f1f] mb-12">
          <StatCell
            label="Total Projects"
            value={loading ? "—" : String(projects.length)}
          />
          <StatCell label="Live Services" value={loading ? "—" : "0"} />
          <StatCell label="Deployments" value="0" />
          <StatCell label="Region" value="AP-SOUTH-1" mono />
        </div>

        {/* Projects grid */}
        {loading ? (
          <LoadingState />
        ) : projects.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>

      {/* Footer bar */}
      <footer className="relative z-10 border-t border-[#1f1f1f] px-8 lg:px-12 h-10 flex items-center justify-between">
        <span className="font-mono text-[9px] text-[#333] uppercase tracking-widest">
          Hatch · Deployment Engine
        </span>
        <span className="font-mono text-[9px] text-[#333] uppercase tracking-widest">
          AWS ECS · ECR · ROUTE53 · ACM
        </span>
      </footer>
    </div>
  );
}

// --- STAT CELL ---
function StatCell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-black px-6 py-5 flex flex-col gap-2">
      <span className="font-mono text-[9px] text-[#333] uppercase tracking-[0.25em]">
        {label}
      </span>
      <span
        className={`text-2xl font-medium text-white leading-none ${mono ? "font-mono text-base" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

// --- PROJECT CARD ---
function ProjectCard({ project }: { project: Project }) {
  const repoOwner = project.repo_url.split("/")[3] ?? "—";
  const repoName = project.repo_name;
  const createdAt = new Date(project.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Link href={`/projects/${project.id}`}>
      <div className="border border-[#1f1f1f] bg-[#050505] hover:border-[#444] hover:bg-[#0a0a0a] transition-all duration-200 p-6 flex flex-col gap-5 group cursor-pointer h-full">
        {/* Top row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://cdn.simpleicons.org/github/FFFFFF"
              alt="GitHub"
              className="w-4 h-4 opacity-40 group-hover:opacity-70 transition-opacity"
            />
            <div>
              <p className="font-mono text-[9px] text-[#444] uppercase tracking-widest">
                {repoOwner}
              </p>
              <p className="text-sm font-medium text-white leading-tight">
                {repoName}
              </p>
            </div>
          </div>
          <StatusPill status="no deployments" />
        </div>

        {/* Divider */}
        <div className="h-px bg-[#111] group-hover:bg-[#1f1f1f] transition-colors" />

        {/* Bottom row */}
        <div className="flex items-center justify-between mt-auto">
          <span className="font-mono text-[9px] text-[#333] uppercase tracking-widest">
            Created {createdAt}
          </span>
          <span className="font-mono text-[9px] text-[#333] group-hover:text-white transition-colors uppercase tracking-widest">
            Open →
          </span>
        </div>
      </div>
    </Link>
  );
}

// --- STATUS PILL ---
function StatusPill({ status }: { status: string }) {
  const isLive = status === "live";
  const isBuilding = status === "building" || status === "deploying";

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 border text-[8px] font-mono uppercase tracking-widest ${
        isLive
          ? "border-[#10b981]/30 bg-[#10b981]/5 text-[#10b981]"
          : isBuilding
            ? "border-[#f59e0b]/30 bg-[#f59e0b]/5 text-[#f59e0b]"
            : "border-[#1f1f1f] bg-transparent text-[#444]"
      }`}
    >
      <span
        className={`w-1 h-1 rounded-full ${
          isLive
            ? "bg-[#10b981]"
            : isBuilding
              ? "bg-[#f59e0b] animate-pulse"
              : "bg-[#333]"
        }`}
      />
      {status}
    </div>
  );
}

// --- EMPTY STATE ---
function EmptyState() {
  return (
    <div className="border border-[#1f1f1f] border-dashed bg-[#050505]/50 flex flex-col items-center justify-center py-32 px-8 text-center gap-6">
      <div className="w-12 h-12 border border-[#1f1f1f] flex items-center justify-center">
        <span className="text-[#333] text-2xl font-light">+</span>
      </div>
      <div className="space-y-2">
        <p className="text-white font-medium">No projects yet</p>
        <p className="text-[#555] text-sm font-light max-w-xs">
          Connect a GitHub repository to deploy your first service.
        </p>
      </div>
      <Link
        href="/new"
        className="font-mono text-xs text-black bg-white px-6 py-3 uppercase tracking-widest font-bold hover:bg-[#e5e5e5] transition-colors"
      >
        Create First Project
      </Link>
    </div>
  );
}

// --- LOADING STATE ---
function LoadingState() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="border border-[#1f1f1f] bg-[#050505] p-6 flex flex-col gap-5 h-[140px]"
          style={{ opacity: 1 - i * 0.2 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 bg-[#111] animate-pulse" />
            <div className="space-y-1.5">
              <div className="w-16 h-2 bg-[#111] animate-pulse" />
              <div className="w-32 h-3 bg-[#111] animate-pulse" />
            </div>
          </div>
          <div className="h-px bg-[#111]" />
          <div className="w-24 h-2 bg-[#111] animate-pulse" />
        </div>
      ))}
    </div>
  );
}
