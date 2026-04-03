/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

export default function Hatch() {
  return (
    <div className="flex flex-col w-full">
      <Header />
      <HeroSection />
      <HowItWorks />
      <SupportedTechnologies />
      <WorkloadPrimitives />
      <ProductFeatures />
      <ArchitectureDiagram />
      <Footer />
    </div>
  );
}

// --- 1. HERO SECTION ---

function HeroSection() {
  return (
    <section className="min-h-[85vh] flex items-center px-6 lg:px-12 py-24 border-b border-[#1f1f1f] relative">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-16 w-full items-center z-10">
        <div className="flex flex-col gap-8 animate-fade-in">
          <h1 className="text-6xl md:text-8xl lg:text-[9rem] font-medium tracking-tighter leading-[0.9] text-white">
            Code in.
            <br />
            <span className="text-[#888]">Live out.</span>
          </h1>

          <p className="text-lg md:text-xl text-[#888] max-w-2xl leading-relaxed font-light">
            You provide the{" "}
            <code className="bg-[#111] px-2 py-1 text-white font-mono text-sm border border-[#333]">
              Dockerfile
            </code>
            . Hatch provisions the queue, builds the image, registers the ECS
            task, routes the ALB, and points the wildcard SSL. Zero
            infrastructure configuration required.
          </p>

          <div className="flex flex-wrap items-center gap-4 mt-4 font-mono text-sm">
            <a
              href="/auth"
              className="bg-white text-black px-8 py-4 font-bold transition-colors uppercase tracking-wider"
            >
              Initialize Stack
            </a>
          </div>
        </div>

        <div className="w-full xl:justify-self-end animate-fade-in delay-200">
          <TerminalSimulator />
        </div>
      </div>
    </section>
  );
}

// --- 2. HOW IT WORKS ---

function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="px-6 lg:px-12 py-12 border-b border-[#1f1f1f] bg-[#030303]/80 backdrop-blur-sm"
    >
      <div className="max-w-3xl mb-20">
        <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-white mb-6">
          Your cloud. Our control plane.
        </h2>
        <p className="text-xl text-[#888] font-light leading-relaxed">
          Hatch is a self-hosted alternative to platforms like Render and
          Heroku. Instead of paying a premium for managed hosting, Hatch lives
          directly inside your AWS account. It automates the complex DevOps
          orchestration entirely in the background.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-[#1f1f1f]">
        <StepCard
          step="01"
          title="Connect Repository"
          desc="Link your GitHub account. Select a repository and branch. Hatch automatically configures webhooks to listen for code changes."
        />
        <StepCard
          step="02"
          title="Configure Environment"
          desc="Set your CPU/Memory requirements, expose your port, and securely add environment variables. Hatch encrypts secrets directly into AWS Secrets Manager."
        />
        <StepCard
          step="03"
          title="Automated Rollout"
          desc="Click deploy. Hatch builds your image, pushes it to a private registry, provisions Fargate compute, and assigns a secure HTTPS domain instantly."
        />
      </div>
    </section>
  );
}

// --- 3. TECHNOLOGIES ---

const TECHNOLOGIES = [
  { name: "Node.js", slug: "nodedotjs", color: "339933" },
  { name: "Python", slug: "python", color: "3776AB" },
  { name: "Go", slug: "go", color: "00ADD8" },
  { name: "Rust", slug: "rust", color: "FFFFFF" },
  { name: "Spring", slug: "spring", color: "6DB33F" },
  { name: "Ruby", slug: "ruby", color: "CC342D" },
  { name: "Docker", slug: "docker", color: "2496ED" },
  { name: "PHP", slug: "php", color: "777BB4" },
  { name: "Elixir", slug: "elixir", color: "4B275F" },
  { name: ".NET", slug: "dotnet", color: "512BD4" },
  { name: "Bun", slug: "bun", color: "FBF0DF" },
  { name: "Next.js", slug: "nextdotjs", color: "FFFFFF" },
  { name: "PostgreSQL", slug: "postgresql", color: "4169E1" },
  { name: "Redis", slug: "redis", color: "FF4438" },
  { name: "RabbitMQ", slug: "rabbitmq", color: "FF6600" },
  { name: "FastAPI", slug: "fastapi", color: "009688" },
  { name: "Terraform", slug: "terraform", color: "844FBA" },
  { name: "Nginx", slug: "nginx", color: "009639" },
];
function SupportedTechnologies() {
  return (
    <section className="px-6 lg:px-12 py-12 border-b border-[#1f1f1f] bg-black relative overflow-hidden">
      <div className="flex flex-col items-center text-center gap-4 mb-24 relative z-10">
        <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-white mb-2">
          Universal Support
        </h2>
        <p className="text-[#888] text-lg max-w-2xl">
          Hatch doesn't lock you into specific buildpacks. We natively support
          every modern language, framework, and architecture through Docker.
        </p>
      </div>

      {/* Staggered Rows Layout */}
      <div className="max-w-5xl mx-auto flex flex-col gap-12 lg:gap-16 relative z-10">
        <TechRow items={TECHNOLOGIES.slice(0, 5)} offset={0} />
        <TechRow items={TECHNOLOGIES.slice(5, 12)} offset={1} />
        <TechRow items={TECHNOLOGIES.slice(12, 18)} offset={2} />
      </div>
    </section>
  );
}

// Helper component for the staggered rows
function TechRow({
  items,
  offset,
}: {
  items: typeof TECHNOLOGIES;
  offset: number;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-12 md:gap-20">
      {items.map((tech, i) => (
        <div
          key={tech.name}
          className="flex flex-col items-center gap-4 group animate-float cursor-default"
          style={{ animationDelay: `${(i + offset) * 0.4}s` }}
        >
          <div className="relative">
            {/* Glow effect behind the icon on hover */}
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 blur-xl transition-opacity duration-100 rounded-full"></div>

            <img
              src={`https://cdn.simpleicons.org/${tech.slug}/${tech.color}`}
              alt={tech.name}
              className="w-14 h-14 md:w-16 md:h-16 opacity-50 grayscale group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500 drop-shadow-md"
            />
          </div>
          <span className="font-mono text-[10px] text-[#555] group-hover:text-white transition-colors duration-300 uppercase tracking-widest">
            {tech.name}
          </span>
        </div>
      ))}
    </div>
  );
}

// --- 4. PRIMITIVES ---

function WorkloadPrimitives() {
  return (
    <section
      id="primitives"
      className="px-6 lg:px-12 py-12 border-b border-[#1f1f1f] bg-[#030303]/80 backdrop-blur-sm"
    >
      <div className="max-w-3xl mb-20">
        <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-white mb-6">
          Everything you need to build.
        </h2>
        <p className="text-xl text-[#888] font-light leading-relaxed">
          Deploy complex architectures using simple building blocks. Select your
          workload type, and Hatch provisions the exact, optimally configured
          AWS resources.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <PrimitiveCard
          title="Web Services"
          desc="Public-facing applications with auto-provisioned SSL, global load balancing, and zero-downtime rollouts."
          icon="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
        />
        <PrimitiveCard
          title="Private Services"
          desc="Internal APIs and microservices that sit safely behind your VPC, completely unexposed to the public internet."
          icon="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
        <PrimitiveCard
          title="Background Workers"
          desc="Always-on processes pulling from queues like RabbitMQ or SQS. Scales horizontally based on persistent workload."
          icon="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <PrimitiveCard
          title="Cron Jobs"
          desc="Scheduled tasks executed via AWS EventBridge triggers. Run maintenance scripts on exact intervals without idle compute."
          icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </div>
    </section>
  );
}

// --- 5. DEV EXPERIENCE ---

function ProductFeatures() {
  return (
    <section className="px-6 lg:px-12 py-12 border-b border-[#1f1f1f] bg-black">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
        <div>
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-8">
            Ship faster without paying the DevOps tax.
          </h2>
          <div className="flex flex-col gap-8">
            <FeatureRow
              title="Zero-Downtime Rollouts"
              desc="Traffic shifts seamlessly to new instances only after health checks pass. Users never see a 502 error during deployments."
            />
            <FeatureRow
              title="Real-Time Log Streaming"
              desc="Every build and deploy step streams live to your browser via WebSocket. Watch your container come alive line by line."
            />
            <FeatureRow
              title="Automated TLS & DNS"
              desc="Every web service gets a secure, HTTPS-enabled URL out of the box. Hatch integrates directly with ACM and Route53."
            />
          </div>
        </div>
        <div className="technical-border bg-[#050505] p-8 shadow-2xl">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 pb-4 border-b border-[#1f1f1f]">
              <img
                src="https://cdn.simpleicons.org/github/FFFFFF"
                alt="GitHub"
                className="w-5 h-5"
              />
              <span className="text-white font-medium text-sm">
                GitOps Workflow
              </span>
            </div>
            <div className="text-sm text-[#888] font-mono leading-loose mt-2">
              <span className="text-white">git commit -m</span> "update caching
              layer"
              <br />
              <span className="text-white">git push origin main</span>
              <br />
              <br />
              <span className="text-[#555]">→</span> Webhook intercepted
              <br />
              <span className="text-[#555]">→</span> Queueing BuildJobEvent...
              <br />
              <span className="text-[#555]">→</span> Compiling container
              image...
              <br />
              <span className="text-[#555]">→</span> Provisioning Fargate
              task...
              <br />
              <span className="text-white mt-4 block flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-[#10b981] inline-block mr-2"></span>
                Live: api.hatch.dev
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// --- 6. ARCHITECTURE DIAGRAM ---

function ArchitectureDiagram() {
  return (
    <section
      id="architecture"
      className="px-6 lg:px-12 py-12 bg-[#030303]/80 backdrop-blur-sm"
    >
      <div className="max-w-4xl mb-20">
        <h2 className="font-mono text-xs tracking-widest uppercase text-[#888] mb-6">
          System Blueprint
        </h2>
        <h3 className="text-4xl md:text-5xl font-medium tracking-tight text-white mb-6">
          Engineered for decoupling.
        </h3>
        <p className="text-xl text-[#888] font-light leading-relaxed">
          Hatch operates as a monorepo of independent microservices
          communicating over RabbitMQ. The API never blocks on builds. Real-time
          logging is handled entirely in-memory via Redis Pub/Sub.
        </p>
      </div>

      <div className="w-full border border-[#1f1f1f] bg-[#050505] py-16 overflow-x-auto relative shadow-2xl flex justify-center">
        <div className="flex flex-col items-center w-[900px]">
          {/* ROW 1: Entry */}
          <div className="grid grid-cols-[180px_1fr_180px_1fr_180px] w-full items-center h-[100px]">
            <ArchNode
              title="GitHub"
              sub="Source control"
              icon="github"
              color="FFFFFF"
            />
            <FlowArrow direction="right" label="OAuth + Webhooks" />
            <ArchNode
              title="API Gateway"
              sub="Go · Gin"
              icon="go"
              color="00ADD8"
            />
            <FlowArrow direction="right" label="BuildJobEvent" />
            <ArchNode
              title="RabbitMQ"
              sub="Message broker"
              icon="rabbitmq"
              color="FF6600"
            />
          </div>

          {/* ROW 2: Vertical connectors */}
          <div className="grid grid-cols-[180px_1fr_180px_1fr_180px] w-full h-16">
            <div />
            <div />
            <FlowArrow direction="down" label="Pub/Sub" />
            <div />
            <FlowArrow direction="down" label="Consume" />
          </div>

          {/* ROW 3: Data layer + Workers */}
          <div className="grid grid-cols-[180px_1fr_180px_1fr_180px] w-full items-start">
            {/* Postgres + Redis stacked on left */}
            <div className="flex flex-col gap-3">
              <ArchNode
                title="PostgreSQL"
                sub="RDS · App data"
                icon="postgresql"
                color="4169E1"
                className="h-[90px]"
              />
              <ArchNode
                title="Redis"
                sub="ElastiCache · Logs"
                icon="redis"
                color="FF4438"
                className="h-[90px]"
              />
            </div>
            <div className="flex items-center justify-center h-full">
              <FlowArrow direction="right" label="Read / Write" />
            </div>
            <ArchNode
              title="API Gateway"
              sub="Stateless"
              icon="go"
              color="00ADD8"
              className="h-[200px]"
            />
            <div />
            {/* Builder + Deployer stacked on right */}
            <div className="flex flex-col w-[180px]">
              <ArchNode
                title="Builder"
                sub="Clone → Build → ECR"
                icon="docker"
                color="2496ED"
                className="h-[100px] shrink-0"
              />
              <div className="h-12 w-full relative">
                <FlowArrow direction="down" label="Image URI" />
              </div>
              <ArchNode
                title="Deployer"
                sub="ECS · ALB · Route53"
                customIcon={<AwsIcon />}
                className="h-[100px] shrink-0"
              />
            </div>
          </div>

          {/* ROW 4: Down to infra */}
          <div className="grid grid-cols-[180px_1fr_180px_1fr_180px] w-full h-16">
            <div />
            <div />
            <div />
            <div />
            <FlowArrow direction="down" label="Provision" />
          </div>

          {/* ROW 5: Target infra */}
          <div className="relative w-full mt-5">
            <div className="absolute inset-x-[-32px] inset-y-[-24px] border border-[#333] bg-[#0a0a0a] pointer-events-none rounded-xl"></div>
            <span className="absolute -top-10 left-[-16px] bg-[#050505] px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-[#888] border border-[#333] rounded-md z-10">
              Target Infrastructure
            </span>
            <div className="grid grid-cols-[180px_1fr_180px_1fr_180px] w-full items-center relative z-10 h-[140px]">
              <ArchNode
                title="ECR Registry"
                sub="Private images"
                customIcon={<AwsIcon />}
                className="h-[140px]"
              />
              <FlowArrow direction="right" />
              <ArchNode
                title="ECS Fargate"
                sub="Serverless compute"
                customIcon={<AwsIcon />}
                className="h-[140px]"
              />
              <FlowArrow direction="right" />
              <ArchNode
                title="ALB + Route53"
                sub="Traffic + DNS + TLS"
                customIcon={<AwsIcon />}
                className="h-[140px]"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// --- HELPER COMPONENTS ---

function StepCard({
  step,
  title,
  desc,
}: {
  step: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="p-10 border-b md:border-b-0 md:border-r border-[#1f1f1f] last:border-0 hover:bg-[#0a0a0a] transition-colors relative group">
      <div className="font-mono text-[10px] text-[#333] mb-8 absolute top-6 right-6">
        {step}
      </div>
      <div className="w-8 h-8 bg-white text-black flex items-center justify-center font-bold text-sm mb-6 group-hover:bg-[#ccc] transition-colors">
        {step}
      </div>
      <h4 className="text-xl font-medium mb-3 text-white">{title}</h4>
      <p className="text-[#888] text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

function PrimitiveCard({
  title,
  desc,
  icon,
}: {
  title: string;
  desc: string;
  icon: string;
}) {
  return (
    <div className="p-8 border border-[#1f1f1f] bg-[#050505] hover:border-[#333] transition-colors duration-300 group">
      <svg
        className="w-8 h-8 mb-6 text-white opacity-60 group-hover:opacity-100 transition-opacity"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeWidth="1.5"
          d={icon}
        />
      </svg>
      <h4 className="text-lg font-medium mb-3 text-white">{title}</h4>
      <p className="text-[#888] text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

function FeatureRow({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex gap-4 group">
      <div className="mt-1.5 w-3 h-3 bg-[#111] border border-[#333] shrink-0 group-hover:border-white transition-colors"></div>
      <div>
        <h4 className="text-white font-medium mb-2">{title}</h4>
        <p className="text-[#888] text-sm leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function ArchNode({
  title,
  sub,
  icon,
  color = "FFFFFF",
  customIcon,
  className = "h-[100px]",
}: {
  title: string;
  sub: string;
  icon?: string;
  color?: string;
  customIcon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`w-[180px] ${className} p-4 border border-[#333] bg-[#050505] flex flex-col items-center justify-center text-center gap-2 relative z-10`}
    >
      {icon && (
        <img
          src={`https://cdn.simpleicons.org/${icon}/${color}`}
          alt=""
          className="w-6 h-6 opacity-90"
        />
      )}
      {customIcon && (
        <div className="w-6 h-6 flex items-center justify-center opacity-90">
          {customIcon}
        </div>
      )}
      <div>
        <div className="text-sm font-medium text-white">{title}</div>
        <div className="font-mono text-[10px] text-[#888] mt-1">{sub}</div>
      </div>
    </div>
  );
}

function FlowArrow({
  direction = "right",
  label,
}: {
  direction?: "right" | "down";
  label?: string;
}) {
  if (direction === "right") {
    return (
      <div className="relative w-full h-full flex items-center justify-center self-stretch z-0">
        {label && (
          // CHANGED: Positioned exactly at the center (top-1/2) and shifted up to rest on the line
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full -mt-1 bg-[#050505] px-2 py-0.5 font-mono text-[9px] text-[#888] border border-[#222] rounded whitespace-nowrap z-10">
            {label}
          </span>
        )}
        <svg
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full h-[2px]"
          preserveAspectRatio="none"
        >
          <line
            x1="0"
            y1="1"
            x2="100%"
            y2="1"
            stroke="#555"
            strokeWidth="2"
            strokeDasharray="4 4"
            className="animate-flow"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center self-stretch z-0">
      {label && (
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#050505] px-2 py-0.5 font-mono text-[9px] text-[#888] border border-[#222] rounded whitespace-nowrap z-10">
          {label}
        </span>
      )}
      <svg
        className="absolute inset-y-0 left-1/2 -translate-x-1/2 h-full w-[2px]"
        preserveAspectRatio="none"
      >
        <line
          x1="1"
          y1="0"
          x2="1"
          y2="100%"
          stroke="#555"
          strokeWidth="2"
          strokeDasharray="4 4"
          className="animate-flow"
        />
      </svg>
    </div>
  );
}

function AwsIcon() {
  return <img src="/aws.svg" alt="AWS" width={24} height={24} />;
}

// --- TERMINAL SIMULATOR ---

const TERMINAL_STEPS = [
  { text: "Initializing deployment environment...", delay: 500 },
  { text: "Cloning repository: github.com/user/project", delay: 800 },
  { text: "Parsing Dockerfile configuration...", delay: 400 },
  { text: "Building image [hatch-build-worker]...", delay: 1200 },
  { text: "Step 1/6: FROM node:20-alpine", delay: 300 },
  { text: "Step 2/6: WORKDIR /app", delay: 200 },
  { text: "Step 3/6: COPY package*.json ./", delay: 400 },
  { text: "Step 4/6: RUN npm ci", delay: 1500 },
  { text: "Step 5/6: COPY . .", delay: 300 },
  { text: "Step 6/6: RUN npm run build", delay: 1800 },
  { text: "Successfully built image 9f8a7d6e", delay: 400 },
  { text: "Pushing to AWS ECR registry...", delay: 900 },
  {
    text: "Registering ECS Task Definition (Fargate 0.5vCPU, 1GB)...",
    delay: 600,
  },
  { text: "Updating ALB Target Group routing...", delay: 700 },
  { text: "Provisioning wildcard SSL via ACM...", delay: 500 },
  { text: "Waiting for container health checks...", delay: 1200 },
  { text: "Deployment verified. Traffic routed.", delay: 400, highlight: true },
];

function TerminalSimulator() {
  const [lines, setLines] = useState<{ text: string; highlight?: boolean }[]>(
    [],
  );
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    let currentStep = 0;
    let isCancelled = false;

    const processStep = () => {
      if (isCancelled || currentStep >= TERMINAL_STEPS.length) {
        if (currentStep >= TERMINAL_STEPS.length) setIsDone(true);
        return;
      }
      const step = TERMINAL_STEPS[currentStep];
      setTimeout(() => {
        if (!isCancelled) {
          setLines((prev) => [
            ...prev,
            { text: step.text, highlight: step.highlight },
          ]);
          currentStep++;
          processStep();
        }
      }, step.delay);
    };

    processStep();
    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <div className="w-full h-[500px] bg-[#050505] technical-border flex flex-col overflow-hidden">
      <div className="h-10 border-b border-[#1f1f1f] bg-[#0a0a0a] flex items-center justify-between px-4">
        <div className="flex gap-2">
          <div className="w-2.5 h-2.5 bg-[#333]"></div>
          <div className="w-2.5 h-2.5 bg-[#333]"></div>
          <div className="w-2.5 h-2.5 bg-[#333]"></div>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-[#555]">
          Build Log — WebSocket Stream
        </div>
      </div>

      <div className="flex-1 p-6 font-mono text-sm overflow-y-auto flex flex-col gap-2 scrollbar-hide">
        <div className="text-[#555] mb-4">
          $ hatch deploy --project api-gateway --target production
        </div>

        {lines.map((line, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 ${line.highlight ? "text-white mt-4 font-bold" : "text-[#888]"}`}
          >
            <span className="text-[#333] shrink-0 select-none">
              {`[${new Date().toISOString().split("T")[1].slice(0, 8)}]`}
            </span>
            <span>
              {line.highlight && <span className="text-[#10b981] mr-2">✓</span>}
              {line.text}
            </span>
          </div>
        ))}

        {!isDone && (
          <div className="flex items-center gap-2 text-[#888] mt-2">
            <span className="text-[#333] shrink-0 select-none">
              {`[${new Date().toISOString().split("T")[1].slice(0, 8)}]`}
            </span>
            <span className="w-2 h-4 bg-[#888] animate-blink inline-block"></span>
          </div>
        )}

        {isDone && (
          <div className="mt-8 p-4 border border-[#1f1f1f] bg-[#0a0a0a] flex items-center justify-between animate-fade-in">
            <span className="text-[#10b981] font-bold text-xs uppercase tracking-wider">
              Status: Live
            </span>
            <a
              href="#"
              className="text-white hover:underline flex items-center gap-2 text-sm"
            >
              https://api-gateway.hatch.dev
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 bg-[#000000]/90 backdrop-blur-md border-b border-[#1f1f1f] px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-3 group cursor-pointer">
          <div className="w-4 h-4 bg-white flex items-center justify-center transition-transform group-hover:scale-90"></div>
          <span className="font-bold tracking-tight text-xl">Hatch</span>
        </Link>
        <nav className="hidden lg:flex items-center gap-6 font-mono text-xs uppercase tracking-wider text-[#888]">
          <Link
            href="#how-it-works"
            className="hover:text-white transition-colors"
          >
            How it works
          </Link>
          <Link
            href="#primitives"
            className="hover:text-white transition-colors"
          >
            Primitives
          </Link>
          <Link
            href="#architecture"
            className="hover:text-white transition-colors"
          >
            Architecture
          </Link>
        </nav>
      </div>

      {/* STRICTLY SIZED HEADER BUTTONS */}
      <div className="flex items-center gap-4">
        <Link
          href="https://github.com/YHQZ1/Hatch"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex w-36 h-10 items-center justify-center gap-2.5 border border-[#333] bg-[#050505] hover:border-white transition-all duration-300 group"
        >
          <img
            src="https://cdn.simpleicons.org/github/FFFFFF"
            alt="GitHub"
            className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity"
          />
          <span className="text-sm font-bold text-[#888] group-hover:text-white transition-colors">
            GitHub
          </span>
        </Link>
        <Link
          href="/auth"
          className="w-36 h-10 flex items-center justify-center bg-white text-black border border-white text-sm font-bold transition-colors duration-300"
        >
          Deploy Now
        </Link>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#1f1f1f] bg-[#050505] pt-20 pb-10 relative z-10 overflow-hidden mt-auto">
      <div className="px-6 lg:px-12 flex flex-col lg:flex-row justify-between gap-16 mb-20">
        {/* Brand */}
        <div className="lg:w-1/3 flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 bg-white flex items-center justify-center">
              <div className="w-2 h-2 bg-black"></div>
            </div>
            <span className="font-bold tracking-tight text-xl text-white">
              Hatch.
            </span>
          </div>
          <p className="text-[#888] text-sm leading-relaxed max-w-sm">
            The self-hosted deployment engine. Bring your AWS account, we handle
            the orchestration. Zero lock-in, pure infrastructure as code.
          </p>
          <a
            href="https://github.com/YHQZ1/Hatch"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 border border-[#333] bg-[#0a0a0a] px-3 py-2 hover:border-white transition-colors group w-fit"
          >
            <img
              src="https://cdn.simpleicons.org/github/FFFFFF"
              className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity"
              alt="GitHub"
            />
            <span className="font-mono text-xs text-[#888] group-hover:text-white transition-colors">
              Star on GitHub
            </span>
          </a>
        </div>

        {/* Links */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-12 lg:gap-16 lg:w-2/3">
          <div className="flex flex-col">
            <span className="font-mono text-[10px] uppercase tracking-widest text-white mb-6">
              Platform
            </span>
            <a
              href="#primitives"
              className="text-[#888] text-sm hover:text-white transition-colors mb-4 block"
            >
              Web Services
            </a>
            <a
              href="#primitives"
              className="text-[#888] text-sm hover:text-white transition-colors mb-4 block"
            >
              Private APIs
            </a>
            <a
              href="#primitives"
              className="text-[#888] text-sm hover:text-white transition-colors mb-4 block"
            >
              Background Workers
            </a>
            <a
              href="#primitives"
              className="text-[#888] text-sm hover:text-white transition-colors block"
            >
              Cron Jobs
            </a>
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-[10px] uppercase tracking-widest text-white mb-6">
              Stack
            </span>
            <a
              href="#architecture"
              className="text-[#888] text-sm hover:text-white transition-colors mb-4 block"
            >
              Architecture
            </a>
            <a
              href="https://github.com/YHQZ1/Hatch"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#888] text-sm hover:text-white transition-colors mb-4 block"
            >
              Terraform Modules
            </a>
            <a
              href="https://github.com/YHQZ1/Hatch"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#888] text-sm hover:text-white transition-colors block"
            >
              Source Code
            </a>
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-[10px] uppercase tracking-widest text-white mb-6">
              Project
            </span>
            <a
              href="https://github.com/YHQZ1/Hatch/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#888] text-sm hover:text-white transition-colors mb-4 block"
            >
              GitHub Issues
            </a>
            <a
              href="https://github.com/YHQZ1/Hatch"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#888] text-sm hover:text-white transition-colors mb-4 block"
            >
              MIT License
            </a>
            <a
              href="/auth"
              className="text-[#888] text-sm hover:text-white transition-colors block"
            >
              Get Started
            </a>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="px-6 lg:px-12 pt-8 border-t border-[#1f1f1f] flex flex-col md:flex-row items-center justify-between gap-6">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[#555]">
          © {new Date().getFullYear()} Hatch · MIT License
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-[#555]">
          Built on AWS ECS · ECR · RDS · ElastiCache · Route53 · ACM
        </span>
      </div>
    </footer>
  );
}
