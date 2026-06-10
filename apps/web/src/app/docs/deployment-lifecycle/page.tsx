"use client";

import React from "react";
import {
  CodeBlock,
  DataTable,
  NumberedCard,
  SimpleNote,
  StatusPill,
} from "../components";

const STAGES = [
  {
    title: "Queued",
    body: "The deployment exists in Postgres and the API has published a build job to RabbitMQ.",
  },
  {
    title: "Building",
    body: "The builder clones the repository, runs Docker build, authenticates to ECR, and pushes the image.",
  },
  {
    title: "Deploying",
    body: "The deployer registers a task definition, configures routing, creates or updates the service, and waits for health.",
  },
  {
    title: "Live",
    body: "At least one task is running and the target group reports healthy.",
  },
  {
    title: "Failed or Canceled",
    body: "The run stopped before going live. The final log line should identify the failed stage.",
  },
];

export default function DeploymentLifecycle() {
  return (
    <div style={{ background: "#030303" }}>
      <div className="flex w-full max-w-[1600px] mx-auto flex-1">
        <main className="flex-1 min-w-0 py-16 px-10 lg:px-20">
          <div className="mb-16 pb-12 border-b border-[#111]">
            <div className="flex items-center gap-2 mb-8">
              <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#333] font-bold">
                Deploying Apps
              </span>
              <span className="text-[#222]">/</span>
              <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#555] font-bold">
                Lifecycle
              </span>
            </div>
            <h1 className="text-5xl md:text-7xl font-medium tracking-tighter text-white mb-6">
              Deployment Lifecycle
            </h1>
            <p className="text-[#888] text-xl leading-relaxed max-w-3xl font-light">
              Every Hatch deployment moves through a small set of states. The
              status tells you where the run is; logs tell you what happened.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-10">
              <StatusPill color="green">Live logs</StatusPill>
              <StatusPill color="blue">Health gated</StatusPill>
              <StatusPill color="red">Cancelable</StatusPill>
            </div>
          </div>

          <section className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Stages
            </h2>
            <div className="border border-[#111] bg-[#050505] mt-8">
              {STAGES.map((stage, index) => (
                <NumberedCard
                  key={stage.title}
                  index={index + 1}
                  title={stage.title}
                  body={stage.body}
                />
              ))}
            </div>
          </section>

          <section className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Status reference
            </h2>
            <DataTable
              columns={["Status", "Meaning"]}
              rows={[
                ["queued", "Waiting for the builder to pick up the job."],
                ["building", "Docker image is being produced and pushed."],
                ["deploying", "Cloud resources are being updated."],
                ["live", "Deployment is healthy and serving traffic."],
                ["failed", "A build, registry, ECS, routing, or health check step failed."],
                ["canceled", "The user canceled the run before final handoff."],
              ]}
            />
          </section>

          <section className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Example log flow
            </h2>
            <CodeBlock
              language="text"
              filename="logs"
              code={`Job received
Syncing source code...
Starting Docker build...
Image successfully pushed
Handoff to Deployer: Provisioning cloud infrastructure...
Registering task definition...
Configuring target group...
Updating routing rules...
Provisioning Fargate service...
Task health: 1 running, 0 pending, target healthy
Deployment live at: https://app.hatchcloud.xyz`}
            />
            <SimpleNote>
              The lifecycle is intentionally explicit. When something breaks,
              the final few log lines should point at the failing layer.
            </SimpleNote>
          </section>
        </main>
      </div>
    </div>
  );
}

