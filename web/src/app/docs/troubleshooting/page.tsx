"use client";

import React from "react";
import {
  CodeBlock,
  DataTable,
  FeatureCard,
  InlineCode,
  SimpleNote,
  StatusPill,
} from "../components";

const TRIAGE_COMMANDS = `curl -i https://<subdomain>.hatchcloud.xyz
nslookup <subdomain>.hatchcloud.xyz
docker build -t hatch-debug .
docker run --rm -p 8080:<container-port> hatch-debug`;

const CHECKS = [
  {
    title: "Build",
    tag: "docker",
    body: "The image must build from the repository root and include everything needed at runtime.",
  },
  {
    title: "Port",
    tag: "runtime",
    body: "The project port in Hatch must match the port your container listens on.",
  },
  {
    title: "Health Check",
    tag: "alb",
    body: "The configured path should return a successful HTTP response after the app starts.",
  },
  {
    title: "DNS",
    tag: "routing",
    body: "The app hostname must resolve to the current user-app load balancer.",
  },
];

export default function Troubleshooting() {
  return (
    <div className="flex w-full">
      <main className="flex-1 min-w-0 py-16 px-10 lg:px-20">
        <div className="mb-16 pb-12 border-b border-[#111]">
          <div className="flex items-center gap-2 mb-8">
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#333] font-bold">
              Deploying Apps
            </span>
            <span className="text-[#222]">/</span>
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#555] font-bold">
              Troubleshooting
            </span>
          </div>

          <div className="flex flex-wrap gap-3 mb-8">
            <StatusPill color="blue">Logs first</StatusPill>
            <StatusPill color="amber">Health checks</StatusPill>
            <StatusPill color="purple">DNS routing</StatusPill>
          </div>

          <h1 className="text-5xl md:text-7xl font-medium tracking-tighter text-white mb-6">
            Troubleshooting
          </h1>
          <p className="text-[#888] text-xl leading-relaxed max-w-3xl font-light">
            Most deployment failures are one of four things: the image did not
            build, the container listened on the wrong port, the health check
            failed, or DNS is still pointing at the wrong place.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-12">
          <div className="min-w-0">
            <section id="fast-check" className="mb-20">
              <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
                Fast Check
              </h2>
              <p className="text-[#777] text-base leading-relaxed max-w-3xl font-light mb-6">
                Start with the deployment log stream. If Hatch says the app is
                live but the URL fails, check the hostname and the response from
                the load balancer directly.
              </p>

              <CodeBlock filename="triage.sh" code={TRIAGE_COMMANDS} />

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
                {CHECKS.map((check) => (
                  <FeatureCard
                    key={check.title}
                    title={check.title}
                    tag={check.tag}
                    body={check.body}
                  />
                ))}
              </div>
            </section>

            <section id="symptoms" className="mb-20">
              <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
                Symptom Map
              </h2>
              <p className="text-[#777] text-base leading-relaxed max-w-3xl font-light">
                Use this table when the deployment reached a known state but the
                app still does not behave as expected.
              </p>

              <DataTable
                columns={["Symptom", "Likely Cause", "Next Step"]}
                rows={[
                  [
                    "Build failed",
                    "Dockerfile, missing lockfile, or private dependency",
                    "Run docker build locally from the repo root",
                  ],
                  [
                    "Task never healthy",
                    "Wrong port, localhost bind, or bad health path",
                    "Check port, bind to 0.0.0.0, and return 200-399",
                  ],
                  [
                    "No project mapped",
                    "Hostname reached the default ALB rule",
                    "Confirm DNS points at the current user-app ALB",
                  ],
                  [
                    "DNS error",
                    "Record missing, stale cache, or proxied incorrectly",
                    "Compare local nslookup with 1.1.1.1",
                  ],
                  [
                    "Repos missing",
                    "GitHub OAuth access changed",
                    "Sign in again and verify repo permissions",
                  ],
                ]}
              />
            </section>

            <section id="runtime" className="mb-20">
              <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
                Runtime Failures
              </h2>
              <p className="text-[#777] text-base leading-relaxed max-w-3xl font-light mb-6">
                When the build and push succeed but the service never becomes
                healthy, check the app process before the cloud infrastructure.
              </p>

              <div className="border border-[#111] bg-[#050505] rounded-[2px] divide-y divide-[#111]">
                {[
                  [
                    "Port mismatch",
                    "The container listens on 3000, but the Hatch project is configured for 80.",
                  ],
                  [
                    "Localhost bind",
                    "The app binds to 127.0.0.1, so the load balancer cannot reach it.",
                  ],
                  [
                    "Slow boot",
                    "The app takes longer than expected before the health check starts passing.",
                  ],
                  [
                    "Bad health path",
                    "The configured health path returns 404, 500, or redirects forever.",
                  ],
                ].map(([title, body]) => (
                  <div key={title} className="p-5">
                    <h3 className="text-white font-medium mb-2">{title}</h3>
                    <p className="text-[#777] text-sm leading-relaxed font-light">
                      {body}
                    </p>
                  </div>
                ))}
              </div>

              <SimpleNote tone="success">
                A good default for web services is to bind to{" "}
                <InlineCode>0.0.0.0</InlineCode>, expose one HTTP port, and keep
                <InlineCode>/</InlineCode> or <InlineCode>/health</InlineCode>{" "}
                returning a simple success response.
              </SimpleNote>
            </section>

            <section id="dns" className="mb-20">
              <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
                DNS And Routing
              </h2>
              <p className="text-[#777] text-base leading-relaxed max-w-3xl font-light">
                If the same URL sometimes works and sometimes returns the
                default Hatch response, local DNS is probably still resolving to
                an old load balancer.
              </p>

              <CodeBlock
                filename="dns-check.sh"
                code={`nslookup <subdomain>.hatchcloud.xyz
nslookup <subdomain>.hatchcloud.xyz 1.1.1.1
curl -i -H "Host: <subdomain>.hatchcloud.xyz" https://<alb-dns-name>/`}
              />

              <SimpleNote tone="warning">
                Browser refreshes do not always clear DNS cache. When in doubt,
                compare your router resolver with <InlineCode>1.1.1.1</InlineCode>
                before changing application code.
              </SimpleNote>
            </section>
          </div>

          <aside className="hidden xl:block">
            <div className="sticky top-28 border border-[#111] bg-[#050505] rounded-[2px] p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#333] font-bold mb-4">
                On This Page
              </p>
              <nav className="flex flex-col gap-3 text-sm font-mono">
                {[
                  ["Fast Check", "#fast-check"],
                  ["Symptoms", "#symptoms"],
                  ["Runtime", "#runtime"],
                  ["DNS", "#dns"],
                ].map(([label, href]) => (
                  <a
                    key={href}
                    href={href}
                    className="text-[#555] hover:text-white transition-colors"
                  >
                    {label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
