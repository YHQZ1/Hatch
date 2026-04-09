"use client";

import React, { useState, useEffect } from "react";

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-[#111] text-[#ccc] px-1.5 py-0.5 rounded-[1px] text-[13px] font-mono border border-[#222]">
      {children}
    </code>
  );
}

const TOC = [
  { id: "api", label: "API Gateway" },
  { id: "builder", label: "Builder Worker" },
  { id: "deployer", label: "Deployer Worker" },
  { id: "web", label: "Web Frontend" },
  { id: "security", label: "Security Best Practices" },
];

function TableOfContents() {
  const [active, setActive] = useState("api");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    TOC.forEach(({ id }) => {
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
        {TOC.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            className={`text-xs py-1 transition-colors border-l pl-4 -ml-[1px] ${active === id ? "text-white border-white" : "text-[#444] border-transparent hover:text-[#888]"}`}
          >
            {label}
          </a>
        ))}
      </div>
    </aside>
  );
}

function EnvTable({ items }: { items: string[][] }) {
  return (
    <div className="rounded-[2px] border border-[#1a1a1a] bg-[#050505] overflow-hidden my-8 font-mono">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#131313] bg-[#0a0a0a]">
            <th className="text-left px-6 py-4 text-[10px] uppercase tracking-[0.2em] text-[#333] font-bold">
              Variable
            </th>
            <th className="text-left px-6 py-4 text-[10px] uppercase tracking-[0.2em] text-[#333] font-bold">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map(([key, val]) => (
            <tr
              key={key}
              className="border-b border-[#0f0f0f] last:border-0 hover:bg-white/[0.01] transition-colors"
            >
              <td className="px-6 py-4 text-[#aaa] text-[12px] font-bold whitespace-nowrap">
                {key}
              </td>
              <td className="px-6 py-4 text-[#555] text-[12px] leading-relaxed">
                {val}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EnvironmentVariables() {
  return (
    <div style={{ background: "#030303" }}>
      <div className="flex w-full max-w-[1600px] mx-auto flex-1">
        <main className="flex-1 min-w-0 py-16 px-10 lg:px-20">
          <div className="mb-16 pb-12 border-b border-[#111]">
            <div className="flex items-center gap-2 mb-8">
              <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#333] font-bold">
                Configuration
              </span>
              <span className="text-[#222]">/</span>
              <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#555] font-bold">
                Env Variables
              </span>
            </div>
            <h1 className="text-5xl md:text-7xl font-medium tracking-tighter text-white mb-6">
              Environment Variables
            </h1>
            <p className="text-[#888] text-xl leading-relaxed max-w-3xl font-light">
              Comprehensive reference for configuring Hatch microservices. Each
              service requires specific keys to communicate with AWS, RabbitMQ,
              and Redis.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-10">
              <span className="flex items-center gap-2 text-[11px] font-mono text-[#555] border border-[#1a1a1a] bg-[#050505] rounded-[2px] px-4 py-1.5 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />{" "}
                GLOBAL SCHEMA
              </span>
              <span className="flex items-center gap-2 text-[11px] font-mono text-[#555] border border-[#1a1a1a] bg-[#050505] rounded-[2px] px-4 py-1.5 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />{" "}
                SECRETS REQUIRED
              </span>
              <span className="flex items-center gap-2 text-[11px] font-mono text-[#555] border border-[#1a1a1a] bg-[#050505] rounded-[2px] px-4 py-1.5 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#a855f7] animate-pulse" />{" "}
                MONOREPO SCOPED
              </span>
            </div>
          </div>

          <section id="api" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              API Gateway
            </h2>
            <p className="text-[#888] text-base leading-relaxed mb-6 font-light">
              Handles authentication, project management, and job publishing.
            </p>
            <EnvTable
              items={[
                [
                  "PORT",
                  "Internal port the Gin server listens on (default: 8080).",
                ],
                [
                  "GITHUB_CLIENT_ID",
                  "OAuth application client ID from GitHub Developer settings.",
                ],
                [
                  "GITHUB_CLIENT_SECRET",
                  "OAuth application secret for exchanging codes for tokens.",
                ],
                [
                  "JWT_SECRET",
                  "High-entropy string used to sign session tokens.",
                ],
                [
                  "DATABASE_URL",
                  "PostgreSQL connection string (e.g., postgres://user:pass@host:5432/db).",
                ],
                ["RABBITMQ_URL", "Connection string for the message broker."],
                [
                  "REDIS_URL",
                  "Connection string for log persistence and real-time streams.",
                ],
              ]}
            />
          </section>

          <section id="builder" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Builder Worker
            </h2>
            <p className="text-[#888] text-base leading-relaxed mb-6 font-light">
              Orchestrates git cloning, Docker builds, and ECR pushing.
            </p>
            <EnvTable
              items={[
                [
                  "AWS_REGION",
                  "The AWS region where ECR repositories are located.",
                ],
                [
                  "ECR_REGISTRY",
                  "Full URI of your private ECR registry (e.g., <id>.dkr.ecr.<region>.amazonaws.com).",
                ],
                [
                  "ECR_REPOSITORY",
                  "Base name for storing build artifacts (default: hatch-builds).",
                ],
                [
                  "REDIS_URL",
                  "Shared with API for streaming build logs back to the dashboard.",
                ],
                ["RABBITMQ_URL", "Shared with API to consume BuildJob events."],
              ]}
            />
          </section>

          <section id="deployer" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Deployer Worker
            </h2>
            <p className="text-[#888] text-base leading-relaxed mb-6 font-light">
              Provisions and updates ECS Fargate tasks and ALB routing rules.
            </p>
            <EnvTable
              items={[
                [
                  "ECS_CLUSTER_NAME",
                  "The name of the cluster provisioned via Terraform.",
                ],
                [
                  "ALB_LISTENER_ARN",
                  "ARN of the ALB listener where rules will be injected.",
                ],
                ["VPC_ID", "The ID of the target VPC for task networking."],
                [
                  "SUBNET_A / SUBNET_B",
                  "Private subnets where Fargate tasks will be launched.",
                ],
                [
                  "TASK_EXECUTION_ROLE_ARN",
                  "IAM Role providing task permissions to ECR and CloudWatch.",
                ],
              ]}
            />
          </section>

          <section id="web" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Web Frontend
            </h2>
            <p className="text-[#888] text-base leading-relaxed mb-6 font-light">
              Next.js application providing the control plane UI.
            </p>
            <EnvTable
              items={[
                [
                  "NEXT_PUBLIC_API_URL",
                  "Public URL of the API Gateway (used for client-side fetches).",
                ],
                [
                  "NEXT_PUBLIC_WS_URL",
                  "WebSocket endpoint for real-time log streaming (optional if using relative paths).",
                ],
              ]}
            />
          </section>

          <section id="security" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Security Best Practices
            </h2>
            <div className="border-l border-zinc-800 pl-6 py-4 my-8">
              <ul className="space-y-4">
                <li className="text-[#666] text-sm leading-relaxed font-light italic">
                  Never commit <InlineCode>.env</InlineCode> files to source
                  control. They are ignored by default via the root{" "}
                  <InlineCode>.gitignore</InlineCode>.
                </li>
                <li className="text-[#666] text-sm leading-relaxed font-light italic">
                  In production, prefer using AWS Secrets Manager or Parameter
                  Store instead of raw environment variables where possible.
                </li>
                <li className="text-[#666] text-sm leading-relaxed font-light italic">
                  Rotate your <InlineCode>JWT_SECRET</InlineCode> and{" "}
                  <InlineCode>GITHUB_CLIENT_SECRET</InlineCode> regularly to
                  minimize exposure.
                </li>
              </ul>
            </div>
          </section>
        </main>
        <TableOfContents />
      </div>
    </div>
  );
}
