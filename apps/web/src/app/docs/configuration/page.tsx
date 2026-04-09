"use client";

import React, { useState, useEffect } from "react";

function TableOfContents() {
  const [active, setActive] = useState("resources");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    const ids = ["resources", "networking", "build-settings", "health-checks"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <aside className="w-56 shrink-0 sticky top-[77px] h-[calc(100vh-77px)] overflow-y-auto py-10 pl-8 hidden xl:block border-l border-[#111]">
      <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#333] mb-4 font-bold">
        On this page
      </div>
      <div className="flex flex-col gap-1.5">
        {[
          { id: "resources", label: "Compute Resources" },
          { id: "networking", label: "Networking" },
          { id: "build-settings", label: "Build Settings" },
          { id: "health-checks", label: "Health Checks" },
        ].map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            className={`text-xs py-1 transition-colors border-l pl-4 -ml-[1px] ${
              active === id
                ? "text-white border-white"
                : "text-[#444] border-transparent hover:text-[#888]"
            }`}
          >
            {label}
          </a>
        ))}
      </div>
    </aside>
  );
}

function ConfigRow({
  label,
  desc,
  type,
  defaultValue,
}: {
  label: string;
  desc: string;
  type: string;
  defaultValue?: string;
}) {
  return (
    <div className="py-6 border-b border-[#111] last:border-0">
      <div className="flex items-center justify-between mb-2">
        <code className="text-[#aaa] text-[13px] font-bold font-mono">
          {label}
        </code>
        <span className="font-mono text-[10px] text-[#333] uppercase tracking-widest">
          {type}
        </span>
      </div>
      <p className="text-[#555] text-sm leading-relaxed mb-2 font-light">
        {desc}
      </p>
      {defaultValue && (
        <div className="text-[11px] font-mono text-zinc-700">
          DEFAULT: <span className="text-zinc-500">{defaultValue}</span>
        </div>
      )}
    </div>
  );
}

export default function ConfigurationReference() {
  return (
    <div className="flex w-full">
      <main className="flex-1 min-w-0 py-16 px-10 lg:px-20">
        <div className="mb-16 pb-12 border-b border-[#111]">
          <div className="flex items-center gap-2 mb-8">
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#333] font-bold">
              Configuration
            </span>
            <span className="text-[#222]">/</span>
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#555] font-bold">
              Reference
            </span>
          </div>
          <h1 className="text-5xl md:text-7xl font-medium tracking-tighter text-white mb-6">
            Configuration
          </h1>
          <p className="text-[#888] text-xl leading-relaxed max-w-3xl font-light">
            Reference for the build and runtime parameters used by the Hatch
            Deployer. These settings control how your application is provisioned
            within AWS Fargate.
          </p>

          <div className="flex flex-wrap items-center gap-4 mt-10">
            <span className="flex items-center gap-2 text-[11px] font-mono text-[#555] border border-[#1a1a1a] bg-[#050505] rounded-[2px] px-4 py-1.5 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /> FARGATE
              NATIVE
            </span>
            <span className="flex items-center gap-2 text-[11px] font-mono text-[#555] border border-[#1a1a1a] bg-[#050505] rounded-[2px] px-4 py-1.5 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" /> DYNAMIC
              ROUTING
            </span>
          </div>
        </div>

        <section id="resources" className="mb-20">
          <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
            Compute Resources
          </h2>
          <div className="border-t border-[#111] mt-8">
            <ConfigRow
              label="cpu"
              desc="The number of CPU units used by the task. 1024 units is equivalent to 1 vCPU."
              type="int"
              defaultValue="256"
            />
            <ConfigRow
              label="memory"
              desc="The amount of memory (in MiB) used by the task."
              type="int"
              defaultValue="512"
            />
          </div>
        </section>

        <section id="networking" className="mb-20">
          <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
            Networking
          </h2>
          <div className="border-t border-[#111] mt-8">
            <ConfigRow
              label="port"
              desc="The container port that your application listens on. Hatch routes ALB traffic to this port."
              type="int"
              defaultValue="80"
            />
            <ConfigRow
              label="subdomain"
              desc="The unique identifier for your project's URL. Once set, this maps to <subdomain>.hatch.dev."
              type="string"
            />
          </div>
        </section>

        <section id="build-settings" className="mb-20">
          <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
            Build Settings
          </h2>
          <div className="border-t border-[#111] mt-8">
            <ConfigRow
              label="dockerfile_path"
              desc="Location of the Dockerfile relative to the repository root."
              type="string"
              defaultValue="./Dockerfile"
            />
            <ConfigRow
              label="branch"
              desc="The git branch used for deployments. Hatch triggers a build on every push to this branch."
              type="string"
              defaultValue="main"
            />
          </div>
        </section>

        <section id="health-checks" className="mb-20">
          <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
            Health Checks
          </h2>
          <div className="border-t border-[#111] mt-8">
            <ConfigRow
              label="health_check_path"
              desc="The endpoint the ALB pings to determine if the container is healthy."
              type="string"
              defaultValue="/"
            />
          </div>
        </section>
      </main>
      <TableOfContents />
    </div>
  );
}
