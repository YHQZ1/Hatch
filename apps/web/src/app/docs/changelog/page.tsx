/* eslint-disable react/no-unescaped-entities */
"use client";

import Link from "next/link";

interface ChangeEntryProps {
  version: string;
  date: string;
  items: {
    type: "added" | "fixed" | "changed" | "improved";
    text: string;
  }[];
}

function ChangeEntry({ version, date, items }: ChangeEntryProps) {
  const typeLabels = {
    added: "text-zinc-100",
    improved: "text-zinc-400",
    fixed: "text-zinc-500",
    changed: "text-zinc-600",
  };

  return (
    <div className="py-12 border-b border-[#111] last:border-0 flex flex-col md:flex-row gap-8 md:gap-16">
      <div className="md:w-48 shrink-0">
        <div className="sticky top-24">
          <h3 className="text-white font-mono text-xl font-bold tracking-tight">
            {version}
          </h3>
          <p className="text-[#333] font-mono text-[10px] uppercase tracking-[0.3em] mt-2">
            {date}
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-6">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col gap-1 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`text-[9px] font-bold uppercase tracking-[0.2em] font-mono ${typeLabels[item.type]}`}
              >
                {item.type}
              </span>
              <div className="h-[1px] flex-1 bg-[#111]" />
            </div>
            <p className="text-zinc-500 text-[13px] leading-relaxed font-light max-w-3xl">
              {item.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Changelog() {
  return (
    <div
      className="flex flex-col w-full min-h-screen"
      style={{ background: "#030303" }}
    >
      <main className="max-w-[1600px] mx-auto w-full py-16 px-10 lg:px-20">
        <div className="mb-16 pb-12 border-b border-[#111]">
          <div className="flex items-center gap-2 mb-8">
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#333] font-bold">
              Project
            </span>
            <span className="text-[#222]">/</span>
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#555] font-bold">
              Changelog
            </span>
          </div>
          <h1 className="text-5xl md:text-7xl font-medium tracking-tighter text-white mb-6">
            Release Notes
          </h1>
          <p className="text-[#888] text-xl leading-relaxed max-w-3xl font-light">
            Technical updates and documentation for official Hatch releases.
          </p>

          <div className="flex flex-wrap items-center gap-4 mt-10">
            <span className="flex items-center gap-2 text-[11px] font-mono text-white border border-[#1a1a1a] bg-[#050505] rounded-[2px] px-4 py-1.5 font-bold">
              PRODUCTION v1.0.0
            </span>
            <Link
              href="https://github.com/YHQZ1/Hatch"
              target="_blank"
              className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 hover:text-white transition-colors border border-[#1a1a1a] bg-[#050505] rounded-[2px] px-4 py-1.5 font-bold"
            >
              SOURCE CODE
            </Link>
          </div>
        </div>

        <div className="max-w-5xl">
          <ChangeEntry
            version="v1.0.0"
            date="April 9, 2026"
            items={[
              {
                type: "added",
                text: "Initial production release of the Hatch Control Plane.",
              },
              {
                type: "added",
                text: "Support for automated AWS Fargate infrastructure provisioning via Terraform and Go.",
              },
              {
                type: "added",
                text: "Integrated build-to-deploy pipeline utilizing RabbitMQ for event orchestration and ECR for image management.",
              },
              {
                type: "added",
                text: "Real-time execution log streaming via WebSockets with Redis persistence for deployment history.",
              },
              {
                type: "added",
                text: "Monochromatic documentation suite with Quick Start, Self-Hosting, and Env-Var references.",
              },
              {
                type: "fixed",
                text: "Stabilized deployment table constraints to support concurrent redeployment requests.",
              },
            ]}
          />
        </div>
      </main>
    </div>
  );
}
