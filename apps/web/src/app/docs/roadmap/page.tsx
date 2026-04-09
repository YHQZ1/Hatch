/* eslint-disable react/no-unescaped-entities */
"use client";

import React from "react";

interface MilestoneProps {
  quarter: string;
  title: string;
  description: string;
  status: "completed" | "in-progress" | "planned";
  features: string[];
}

function Milestone({
  quarter,
  title,
  description,
  status,
  features,
}: MilestoneProps) {
  const isCurrent = status === "in-progress";

  return (
    <div className="relative pl-12 pb-20 last:pb-0 group">
      {/* Vertical Track */}
      <div className="absolute left-[5px] top-2 bottom-0 w-[1px] bg-zinc-900 group-last:bg-transparent" />

      {/* Sharp Crosshair Marker */}
      <div className="absolute left-0 top-1.5 w-[11px] h-[11px] bg-black border border-zinc-800 z-10 flex items-center justify-center">
        {status === "completed" && <div className="w-1 h-1 bg-zinc-400" />}
        {isCurrent && (
          <div className="w-1.5 h-1.5 bg-[#a855f7] animate-pulse" />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
            {quarter}
          </span>
          <div
            className={`h-[1px] w-8 ${isCurrent ? "bg-[#a855f7]/30" : "bg-zinc-900"}`}
          />
          <span
            className={`text-[9px] font-mono uppercase tracking-widest font-bold ${isCurrent ? "text-[#a855f7]" : "text-zinc-600"}`}
          >
            {status}
          </span>
        </div>

        <div className="space-y-2">
          <h3
            className={`text-xl font-medium tracking-tight ${isCurrent ? "text-white" : "text-zinc-300"}`}
          >
            {title}
          </h3>
          <p className="text-zinc-500 text-sm max-w-2xl font-light leading-relaxed">
            {description}
          </p>
        </div>

        <ul className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3">
          {features.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-3 text-[12px] font-mono text-zinc-600"
            >
              <span className="text-zinc-800 text-[10px]">0{i + 1}</span>
              <span className="group-hover:text-zinc-400 transition-colors">
                {f}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Roadmap() {
  return (
    <div
      className="flex flex-col w-full min-h-screen"
      style={{ background: "#030303" }}
    >
      <main className="max-w-[1600px] mx-auto w-full py-16 px-10 lg:px-20">
        {/* Header Section */}
        <div className="mb-20 pb-12 border-b border-[#111]">
          <div className="flex items-center gap-2 mb-8">
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#333] font-bold">
              Project
            </span>
            <span className="text-[#222]">/</span>
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#555] font-bold">
              Roadmap
            </span>
          </div>
          <h1 className="text-5xl md:text-7xl font-medium tracking-tighter text-white mb-6">
            Evolution
          </h1>
          <p className="text-[#888] text-xl leading-relaxed max-w-3xl font-light">
            The technical trajectory for Hatch. Our focus is on removing
            infrastructure complexity while maintaining total architectural
            control within your own AWS environment.
          </p>

          <div className="flex flex-wrap items-center gap-4 mt-10">
            <span className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 border border-[#1a1a1a] bg-[#050505] rounded-[2px] px-4 py-1.5 font-bold">
              v1.0.0 STABLE
            </span>
            <span className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 border border-[#1a1a1a] bg-[#050505] rounded-[2px] px-4 py-1.5 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#a855f7] animate-pulse" />{" "}
              ACTIVE SPRINT
            </span>
          </div>
        </div>

        {/* Timeline Section */}
        <div className="max-w-4xl">
          <Milestone
            quarter="Q1 2026"
            title="Foundation"
            description="Initial launch of the Go control plane, RabbitMQ orchestration, and AWS Fargate integration."
            status="completed"
            features={[
              "GitOps Event Pipeline",
              "WebSocket Log Streams",
              "Wildcard SSL Routing",
              "Build History Archive",
            ]}
          />

          <Milestone
            quarter="Q2 2026"
            title="Productivity"
            description="Optimizing the developer loop with preview environments and advanced domain management."
            status="in-progress"
            features={[
              "PR Preview Environments",
              "Custom Domain Mapping",
              "Automated ACM Provisioning",
              "Atomic Build Rollbacks",
            ]}
          />

          <Milestone
            quarter="Q3 2026"
            title="Workloads"
            description="Expanding support beyond web services to handle background processing and complex networking."
            status="planned"
            features={[
              "Scheduled Cron Jobs",
              "Private VPC Link Services",
              "Persistent EFS Volumes",
              "Internal Service Discovery",
            ]}
          />

          <Milestone
            quarter="Q4 2026"
            title="Governance"
            description="Tools for teams to manage security, costs, and multi-region infrastructure at scale."
            status="planned"
            features={[
              "RBAC Permissions",
              "CloudTrail Audit Logs",
              "Cost Usage Dashboards",
              "Multi-Region Failover",
            ]}
          />
        </div>
      </main>
    </div>
  );
}
