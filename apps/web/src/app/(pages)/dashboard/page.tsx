/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/app/components/Navbar";

interface Project {
  id: string;
  repo_name: string;
  repo_url: string;
  created_at: string;
}

export default function Dashboard() {
  const router = useRouter();
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

  if (!mounted) return <div className="min-h-screen bg-[var(--bg)]" />;

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] text-[var(--text-main)] flex flex-col relative overflow-x-hidden selection:bg-white selection:text-black font-sans">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.05]" />
      </div>

      <Navbar />

      <main className="relative z-10 flex-grow px-8 lg:px-12 py-12">
        <div className="flex items-start justify-between mb-12">
          <div className="space-y-2">
            <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-[0.3em]">
              Control Plane
            </p>
            <h1 className="text-4xl md:text-6xl font-medium tracking-tighter leading-none uppercase">
              Projects
            </h1>
          </div>
          <Link
            href="/new"
            className="flex items-center gap-3 bg-white text-black px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-[#e5e5e5] transition-all duration-300 shadow-xl"
          >
            <span className="text-lg leading-none">+</span>
            New Project
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--border)] border border-[var(--border)] mb-12 shadow-2xl">
          <StatCell
            label="Total Projects"
            value={loading ? "—" : String(projects.length)}
          />
          <StatCell label="Live Services" value={loading ? "—" : "0"} />
          <StatCell label="Deployments" value="0" />
          <StatCell label="Region" value="AP-SOUTH-1" mono />
        </div>

        {loading ? (
          <LoadingState />
        ) : projects.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

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
    <div className="bg-[var(--bg)] px-6 py-5 flex flex-col gap-2">
      <span className="font-mono text-[9px] text-[var(--text-muted)] uppercase tracking-[0.25em]">
        {label}
      </span>
      <span
        className={`text-2xl font-medium text-white leading-none ${mono ? "font-mono text-base opacity-70" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

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
      <div className="border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-focus)] hover:bg-[var(--surface-hover)] transition-all duration-300 p-8 flex flex-col gap-6 group cursor-pointer h-full rounded-sm shadow-lg">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <img
              src="https://cdn.simpleicons.org/github/FFFFFF"
              alt="GitHub"
              className="w-5 h-5 opacity-30 group-hover:opacity-100 transition-opacity"
            />
            <div>
              <p className="font-mono text-[9px] text-[var(--text-muted)] uppercase tracking-widest">
                {repoOwner}
              </p>
              <p className="text-lg font-medium text-white leading-tight tracking-tight">
                {repoName}
              </p>
            </div>
          </div>
          <StatusPill status="no deployments" />
        </div>

        <div className="h-px bg-[var(--border)] opacity-50 transition-colors group-hover:opacity-100" />

        <div className="flex items-center justify-between mt-auto">
          <span className="font-mono text-[9px] text-[var(--text-muted)] uppercase tracking-widest">
            Created {createdAt}
          </span>
          <span className="font-mono text-[9px] text-[var(--text-muted)] group-hover:text-white transition-colors uppercase tracking-widest">
            Open →
          </span>
        </div>
      </div>
    </Link>
  );
}

function StatusPill({ status }: { status: string }) {
  const isLive = status === "live";
  return (
    <div className="flex items-center gap-2 px-3 py-1 border border-[var(--border)] text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
      <div
        className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-[var(--success)]" : "bg-[#333]"} transition-colors`}
      />
      {status}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-[var(--border)] border-dashed bg-[var(--surface)] flex flex-col items-center justify-center py-32 px-8 text-center gap-6">
      <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-[0.4em]">
        Zero_Projects_Allocated
      </p>
      <Link
        href="/new"
        className="font-mono text-xs text-black bg-white px-8 py-3 uppercase tracking-widest font-bold hover:bg-[#e5e5e5] transition-colors"
      >
        Create First Project
      </Link>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="border border-[var(--border)] bg-[var(--surface)] p-8 h-[200px] animate-pulse"
        />
      ))}
    </div>
  );
}
