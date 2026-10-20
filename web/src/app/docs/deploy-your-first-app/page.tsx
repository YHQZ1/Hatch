"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import {
  CodeBlock,
  FeatureCard,
  InlineCode,
  NumberedCard,
  SimpleNote,
  StatusPill,
} from "../components";

const TOC = [
  { id: "overview", label: "What you will deploy" },
  { id: "repo", label: "Repository checklist" },
  { id: "project", label: "Create the project" },
  { id: "runtime", label: "Runtime contract" },
  { id: "deploy", label: "Deploy and watch logs" },
  { id: "verify", label: "Verify production" },
];

function TableOfContents() {
  const [active, setActive] = useState("overview");

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

export default function DeployYourFirstApp() {
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
                First Deploy
              </span>
            </div>
            <h1 className="text-5xl md:text-7xl font-medium tracking-tighter text-white mb-6">
              Deploy Your First App
            </h1>
            <p className="text-[#888] text-xl leading-relaxed max-w-3xl font-light">
              Take a Dockerized GitHub repository from source code to a live
              Hatch URL. This is the shortest path from repo to production.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-10">
              <StatusPill color="green">5-10 min</StatusPill>
              <StatusPill color="blue">GitHub required</StatusPill>
              <StatusPill color="purple">Dockerfile first</StatusPill>
            </div>
          </div>

          <section id="overview" className="mb-20 scroll-mt-28">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              What you will deploy
            </h2>
            <p className="text-[#888] text-base leading-relaxed mb-8 font-light">
              Hatch deploys one project as one running service. The project
              points to a GitHub repo, a branch, a Dockerfile, a container port,
              and a subdomain. Hatch turns those settings into a built image,
              ECS service, target group, listener rule, and HTTPS URL.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FeatureCard
                title="Source"
                body="GitHub repository, branch, Dockerfile path"
                tag="repo"
              />
              <FeatureCard
                title="Runtime"
                body="Port, health check, env vars"
                tag="config"
              />
              <FeatureCard
                title="Output"
                body="Live Hatch URL with logs and deployment history"
                tag="live"
              />
            </div>
          </section>

          <section id="repo" className="mb-20 scroll-mt-28">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Repository checklist
            </h2>
            <div className="border border-[#111] bg-[#050505] mt-8">
              {[
                "A Dockerfile is committed at the root or a known subpath.",
                "The container listens on one stable port.",
                "The app binds to 0.0.0.0 inside the container.",
                "A health check path returns 200-399 when the app is ready.",
                "Runtime secrets are provided as environment variables, not baked into the image.",
              ].map((item, index) => (
                <NumberedCard
                  key={item}
                  index={index + 1}
                  title={item}
                  body="Check this before deploying. Most first-deploy failures come from Dockerfile, port, or health check mismatches."
                />
              ))}
            </div>
          </section>

          <section id="project" className="mb-20 scroll-mt-28">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Create the project
            </h2>
            <p className="text-[#888] text-base leading-relaxed mb-6 font-light">
              Open the Hatch console, click <InlineCode>New</InlineCode>, choose
              a GitHub repository, then confirm the branch and Dockerfile path.
              If the Dockerfile declares an <InlineCode>EXPOSE</InlineCode>{" "}
              port, Hatch will use it as the service port.
            </p>
            <SimpleNote>
              Keep the subdomain short and readable. It becomes the default
              production URL for the app.
            </SimpleNote>
          </section>

          <section id="runtime" className="mb-20 scroll-mt-28">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Runtime contract
            </h2>
            <CodeBlock
              language="text"
              filename="recommended defaults"
              code={`branch          main
dockerfile      Dockerfile
port            detected from EXPOSE
health check    /`}
            />
            <p className="text-[#888] text-base leading-relaxed font-light">
              Hatch reads the Dockerfile first. If no port is declared, use the
              port your process actually listens on. Hatch manages the
              underlying compute allocation for the service.
            </p>
          </section>

          <section id="deploy" className="mb-20 scroll-mt-28">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Deploy and watch logs
            </h2>
            <p className="text-[#888] text-base leading-relaxed mb-6 font-light">
              Click <InlineCode>Deploy Manually</InlineCode>. Hatch streams the
              build and deploy logs in real time so you can see exactly where
              the app is: queued, building, deploying, or live.
            </p>
            <CodeBlock
              language="text"
              filename="deployment stream"
              code={`Job received
Syncing source code...
Starting Docker build...
Image successfully pushed
Registering task definition...
Updating routing rules...
Task health: 1 running, 0 pending, target healthy
Deployment live at: https://your-app.hatchcloud.xyz`}
            />
          </section>

          <section id="verify" className="mb-20 scroll-mt-28">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Verify production
            </h2>
            <p className="text-[#888] text-base leading-relaxed mb-6 font-light">
              Open the generated Hatch URL and test the path your users will
              hit. If the app does not load, check logs first, then use the{" "}
              <Link
                href="/docs/troubleshooting"
                className="text-white underline underline-offset-4 decoration-[#333] hover:decoration-white"
              >
                troubleshooting guide
              </Link>
              .
            </p>
            <SimpleNote tone="success">
              Once the app is live, future deploys reuse the same project and
              replace the service behind the same URL.
            </SimpleNote>
          </section>
        </main>
        <TableOfContents />
      </div>
    </div>
  );
}
