"use client";

import Link from "next/link";
import React, { useState, useEffect } from "react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-[#444] hover:text-[#888] transition-colors"
    >
      {copied ? (
        <>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

function CodeBlock({
  code,
  language = "bash",
  filename,
}: {
  code: string;
  language?: string;
  filename?: string;
}) {
  return (
    <div className="rounded-[2px] border border-[#1a1a1a] bg-[#0a0a0a] overflow-hidden my-5">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-3">
          {filename && (
            <span className="text-[#555] text-xs font-mono">{filename}</span>
          )}
          {!filename && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#333]">
              {language}
            </span>
          )}
        </div>
        <CopyButton text={code} />
      </div>
      <pre className="p-5 overflow-x-auto">
        <code className="font-mono text-[13px] text-[#8a8a8a] leading-6 whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
}

function SimpleNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l border-zinc-700 pl-6 py-2 my-8">
      <div className="text-[#666] text-sm leading-relaxed font-light italic">
        {children}
      </div>
    </div>
  );
}

const TOC = [
  { id: "prerequisites", label: "Prerequisites" },
  { id: "clone", label: "Clone & Install" },
  { id: "github-oauth", label: "GitHub OAuth App" },
  { id: "env-vars", label: "Environment Variables" },
  { id: "infrastructure", label: "Local Infrastructure" },
  { id: "migrations", label: "Run Migrations" },
  { id: "services", label: "Run Services" },
  { id: "next-steps", label: "Next Steps" },
];

function TableOfContents() {
  const [active, setActive] = useState("prerequisites");

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

export default function QuickStart() {
  return (
    <div style={{ background: "#030303" }}>
      <div className="flex w-full max-w-[1600px] mx-auto flex-1">
        <main className="flex-1 min-w-0 py-16 px-10 lg:px-20">
          <div className="mb-16 pb-12 border-b border-[#111]">
            <div className="flex items-center gap-2 mb-8">
              <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#333] font-bold">
                Getting Started
              </span>
              <span className="text-[#222]">/</span>
              <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#555] font-bold">
                Quick Start
              </span>
            </div>
            <h1 className="text-5xl md:text-7xl font-medium tracking-tighter text-white mb-6">
              Quick Start
            </h1>
            <p className="text-[#888] text-xl leading-relaxed max-w-3xl font-light">
              Get Hatch running locally in under 15 minutes. This guide walks
              you through cloning the repo, wiring up GitHub OAuth, spinning up
              local infrastructure, and making your first deployment.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-10">
              <span className="flex items-center gap-2 text-[11px] font-mono text-[#555] border border-[#1a1a1a] bg-[#050505] rounded-[2px] px-4 py-1.5 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /> ~30
                MIN
              </span>
              <span className="flex items-center gap-2 text-[11px] font-mono text-[#555] border border-[#1a1a1a] bg-[#050505] rounded-[2px] px-4 py-1.5 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" /> AWS
                COSTS APPLY
              </span>
              <span className="flex items-center gap-2 text-[11px] font-mono text-[#555] border border-[#1a1a1a] bg-[#050505] rounded-[2px] px-4 py-1.5 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#a855f7] animate-pulse" />{" "}
                TERRAFORM REQUIRED
              </span>
            </div>
          </div>

          <section id="prerequisites" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Prerequisites
            </h2>
            <p className="text-[#888] text-base leading-relaxed mb-8 font-light">
              Make sure you have the following installed and configured before
              starting.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  name: "Go 1.23+",
                  desc: "API, builder, and deployer services",
                  href: "https://go.dev/dl/",
                },
                {
                  name: "Node.js 20+",
                  desc: "Next.js frontend",
                  href: "https://nodejs.org",
                },
                {
                  name: "Docker + Compose",
                  desc: "Local infrastructure & image builds",
                  href: "https://docs.docker.com/get-docker/",
                },
                {
                  name: "AWS CLI",
                  desc: "Configured with IAM credentials",
                  href: "https://aws.amazon.com/cli/",
                },
                {
                  name: "Terraform 1.5+",
                  desc: "Infrastructure provisioning",
                  href: "https://developer.hashicorp.com/terraform/install",
                },
                {
                  name: "golang-migrate",
                  desc: "Running database migrations",
                  href: "https://github.com/golang-migrate/migrate",
                },
              ].map((p) => (
                <Link
                  key={p.name}
                  href={p.href}
                  target="_blank"
                  className="flex items-start gap-4 p-5 border border-[#131313] bg-[#050505] hover:border-[#333] hover:bg-[#080808] transition-all group rounded-[2px]"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-[#333] mt-1 shrink-0 group-hover:text-white transition-colors"
                  >
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                  </svg>
                  <div>
                    <div className="text-[#ccc] text-sm font-medium group-hover:text-white">
                      {p.name}
                    </div>
                    <div className="text-[#444] text-[11px] mt-1 font-mono uppercase tracking-wider">
                      {p.desc}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section id="clone" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Clone & Install
            </h2>
            <p className="text-[#888] text-base leading-relaxed mb-6 font-light">
              Clone the Hatch monorepo and install dependencies for the
              workspace and frontend.
            </p>
            <CodeBlock
              code={`git clone https://github.com/YHQZ1/Hatch.git\ncd Hatch`}
            />
            <CodeBlock
              code={`cd apps/web && npm install && cd ../..\ngo work sync`}
            />
          </section>

          <section id="github-oauth" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              GitHub OAuth App
            </h2>
            <p className="text-[#888] text-base leading-relaxed mb-6 font-light">
              Hatch uses GitHub OAuth for authentication. Create an OAuth App in
              your GitHub settings.
            </p>
            <p className="text-[#888] text-base leading-relaxed mb-6 font-light">
              Visit{" "}
              <Link
                href="https://github.com/settings/developers"
                target="_blank"
                className="text-white underline underline-offset-4 decoration-[#333] hover:decoration-white transition-colors"
              >
                github.com/settings/developers
              </Link>{" "}
              → OAuth Apps → New OAuth App:
            </p>
            <div className="rounded-[2px] border border-[#1a1a1a] bg-[#050505] overflow-hidden my-8 font-mono">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#131313] bg-[#0a0a0a]">
                    <th className="text-left px-6 py-4 text-[10px] uppercase tracking-[0.2em] text-[#333] font-bold">
                      Field
                    </th>
                    <th className="text-left px-6 py-4 text-[10px] uppercase tracking-[0.2em] text-[#333] font-bold">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Application name", "Hatch"],
                    ["Homepage URL", "http://localhost:3000"],
                    [
                      "Authorization callback URL",
                      "http://localhost:8080/auth/callback",
                    ],
                  ].map(([key, val]) => (
                    <tr
                      key={key}
                      className="border-b border-[#0f0f0f] last:border-0 hover:bg-white/[0.01] transition-colors"
                    >
                      <td className="px-6 py-4 text-[#555] text-[13px]">
                        {key}
                      </td>
                      <td className="px-6 py-4 text-[#aaa] text-[13px]">
                        {val}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SimpleNote>
              Copy the Client ID and generated Client Secret. You will need
              these for your environment configuration in the next step.
            </SimpleNote>
          </section>

          <section id="env-vars" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Environment Variables
            </h2>
            <CodeBlock
              code={`cp apps/api/.env.example apps/api/.env\ncp apps/builder/.env.example apps/builder/.env\ncp apps/deployer/.env.example apps/deployer/.env\ncp apps/web/.env.local.example apps/web/.env.local`}
            />
            <CodeBlock
              language="env"
              filename="apps/api/.env"
              code={`PORT=8080\nGITHUB_CLIENT_ID=your_github_client_id\nGITHUB_CLIENT_SECRET=your_github_client_secret\nGITHUB_REDIRECT_URI=http://localhost:8080/auth/callback\nJWT_SECRET=a_long_random_string_at_least_32_chars\nDATABASE_URL=postgres://hatch:hatch@localhost:5432/hatch?sslmode=disable\nREDIS_URL=redis://localhost:6379\nRABBITMQ_URL=amqp://guest:guest@localhost:5672/`}
            />
          </section>

          <section id="infrastructure" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Local Infrastructure
            </h2>
            <CodeBlock code={`docker compose up -d postgres redis rabbitmq`} />
            <SimpleNote>
              Infrastructure binds: PostgreSQL (5432), Redis (6379), and
              RabbitMQ (5672).
            </SimpleNote>
          </section>

          <section id="migrations" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Run Migrations
            </h2>
            <CodeBlock
              code={`migrate -path packages/db/migrations -database "postgres://hatch:hatch@localhost:5432/hatch?sslmode=disable" up`}
            />
          </section>

          <section id="services" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Run Services
            </h2>
            <CodeBlock
              code={`# Terminal 1 — API\ncd apps/api && go run cmd/server/main.go\n\n# Terminal 2 — Builder\ncd apps/builder && go run cmd/worker/main.go\n\n# Terminal 3 — Deployer\ncd apps/deployer && go run cmd/worker/main.go\n\n# Terminal 4 — Frontend\ncd apps/web && npm run dev`}
            />
            <SimpleNote>
              Open localhost:3000 to connect your GitHub account and initiate
              your first deployment. Build logs will stream live via WebSockets.
            </SimpleNote>
          </section>

          <section id="next-steps" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Next Steps
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  title: "Self-Hosting Guide",
                  desc: "Provision Hatch on AWS with Terraform.",
                  href: "/docs/self-hosting",
                  tag: "DOCS",
                },
                {
                  title: "Environment Variables",
                  desc: "Full configuration reference.",
                  href: "/docs/environment-variables",
                  tag: "REF",
                },
                {
                  title: "Architecture",
                  desc: "Understanding the system blueprint.",
                  href: "/#architecture",
                  tag: "SYSTEM",
                },
                {
                  title: "Roadmap",
                  desc: "Planned features and milestones.",
                  href: "/roadmap",
                  tag: "PROJECT",
                },
              ].map((card) => (
                <Link
                  key={card.title}
                  href={card.href}
                  className="flex flex-col gap-4 p-6 border border-[#131313] bg-[#050505] hover:border-[#333] hover:bg-[#080808] transition-all group rounded-[2px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium text-base group-hover:underline underline-offset-4 tracking-tight">
                      {card.title}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#333] border border-[#1a1a1a] px-3 py-1 rounded-full font-bold">
                      {card.tag}
                    </span>
                  </div>
                  <p className="text-[#555] text-[13px] leading-relaxed font-mono uppercase tracking-wide">
                    {card.desc}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </main>
        <TableOfContents />
      </div>
    </div>
  );
}
