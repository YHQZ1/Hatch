"use client";

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

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-[#111] text-[#ccc] px-1.5 py-0.5 rounded-[1px] text-[13px] font-mono border border-[#222]">
      {children}
    </code>
  );
}

const TOC = [
  { id: "overview", label: "What Gets Provisioned" },
  { id: "aws-credentials", label: "AWS Credentials" },
  { id: "state-bucket", label: "Terraform State Bucket" },
  { id: "provision", label: "Provision Infrastructure" },
  { id: "configure", label: "Configure Services" },
  { id: "build-push", label: "Build & Push Images" },
  { id: "migrations", label: "Run Migrations" },
  { id: "deploy-services", label: "Deploy to ECS" },
  { id: "frontend", label: "Deploy Frontend" },
  { id: "costs", label: "Cost Estimates" },
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
            className={`text-xs py-1 transition-colors border-l pl-4 -ml-[1px] ${active === id ? "text-white border-white" : "text-[#444] border-transparent hover:text-[#888]"}`}
          >
            {label}
          </a>
        ))}
      </div>
    </aside>
  );
}

export default function SelfHosting() {
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
                Self Hosting
              </span>
            </div>
            <h1 className="text-5xl md:text-7xl font-medium tracking-tighter text-white mb-6">
              Self Hosting
            </h1>
            <p className="text-[#888] text-xl leading-relaxed max-w-3xl font-light">
              Run Hatch in production on your own AWS account. Provision
              infrastructure with Terraform and deploy each service to ECS
              Fargate.
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

          <section id="overview" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              What Gets Provisioned
            </h2>
            <p className="text-[#888] text-base leading-relaxed mb-8 font-light">
              Infrastructure created in <InlineCode>infra/envs/dev</InlineCode>:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  name: "VPC + Subnets",
                  desc: "Isolated network with public/private pairs across 2 AZs",
                },
                {
                  name: "ECS Cluster",
                  desc: "Fargate cluster for all user application tasks",
                },
                {
                  name: "Application Load Balancer",
                  desc: "Traffic routing via path-based rules",
                },
                {
                  name: "AWS ECR",
                  desc: "Private registry for built container images",
                },
                {
                  name: "RDS PostgreSQL 16",
                  desc: "Managed relational database for app data",
                },
                {
                  name: "ElastiCache Redis",
                  desc: "Managed Redis for log streaming",
                },
              ].map((item) => (
                <div
                  key={item.name}
                  className="flex items-start gap-4 p-5 border border-[#131313] bg-[#050505] rounded-[2px]"
                >
                  <div className="w-1 h-1 rounded-full bg-zinc-700 mt-2 shrink-0" />
                  <div>
                    <div className="text-[#ccc] text-sm font-medium">
                      {item.name}
                    </div>
                    <div className="text-[#444] text-[11px] mt-1 font-mono uppercase tracking-wider">
                      {item.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="aws-credentials" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              AWS Credentials
            </h2>
            <CodeBlock
              code={`aws configure\n# AWS Access Key ID: your_access_key\n# AWS Secret Access Key: your_secret_key\n# Default region: ap-south-1`}
            />
            <SimpleNote>
              Ensure your IAM principal has permissions for ECS, ECR, RDS,
              ElastiCache, IAM, and VPC management.
            </SimpleNote>
          </section>

          <section id="state-bucket" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Terraform State Bucket
            </h2>
            <CodeBlock
              code={`aws s3 mb s3://hatch-terraform-state-<account-id> --region ap-south-1\naws s3api put-bucket-versioning --bucket hatch-terraform-state-<account-id> --versioning-configuration Status=Enabled`}
            />
          </section>

          <section id="provision" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Provision Infrastructure
            </h2>
            <CodeBlock
              code={`cd infra/envs/dev\nterraform init\nterraform plan\nterraform apply`}
            />
          </section>

          <section id="configure" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Configure Services
            </h2>
            <CodeBlock
              language="env"
              filename="apps/deployer/.env"
              code={`RABBITMQ_URL=amqp://guest:guest@<rabbitmq-host>:5672/\nREDIS_URL=redis://<redis-endpoint>:6379\nECS_CLUSTER_NAME=hatch-cluster\nALB_LISTENER_ARN=arn:aws:elasticloadbalancing:...\nECR_REGISTRY=<account-id>.dkr.ecr.ap-south-1.amazonaws.com`}
            />
          </section>

          <section id="build-push" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Build & Push Images
            </h2>
            <CodeBlock
              code={`aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.ap-south-1.amazonaws.com\ndocker build --platform linux/amd64 -t hatch-api ./apps/api\ndocker push <account-id>.dkr.ecr.ap-south-1.amazonaws.com/hatch-api:latest`}
            />
          </section>

          <section id="migrations" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Run Migrations
            </h2>
            <CodeBlock
              code={`migrate -path packages/db/migrations -database "postgres://hatch:<password>@<rds-endpoint>:5432/hatch?sslmode=require" up`}
            />
          </section>

          <section id="deploy-services" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Deploy to ECS
            </h2>
            <CodeBlock
              code={`aws ecs register-task-definition --cli-input-json file://infra/tasks/api.json\naws ecs create-service --cluster hatch-cluster --service-name hatch-api --task-definition hatch-api --desired-count 1 --launch-type FARGATE`}
            />
          </section>

          <section id="frontend" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Deploy Frontend
            </h2>
            <p className="text-[#888] text-base leading-relaxed mb-6 font-light">
              Deploy the Next.js frontend to Vercel and point it to your
              production ALB.
            </p>
            <CodeBlock
              language="env"
              code={`NEXT_PUBLIC_API_URL=https://<your-alb-dns-name>`}
            />
            <SimpleNote>
              Once healthy, your container becomes reachable at your ALB DNS
              with automated build log streaming.
            </SimpleNote>
          </section>

          <section id="costs" className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Cost Estimates
            </h2>
            <div className="rounded-[2px] border border-[#1a1a1a] bg-[#050505] overflow-hidden my-8 font-mono">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#131313] bg-[#0a0a0a]">
                    <th className="text-left px-6 py-4 text-[10px] uppercase tracking-[0.2em] text-[#333] font-bold">
                      Service
                    </th>
                    <th className="text-left px-6 py-4 text-[10px] uppercase tracking-[0.2em] text-[#333] font-bold">
                      ~Monthly
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["ALB", "~$20"],
                    ["ECS Fargate", "~$20"],
                    ["RDS PostgreSQL", "~$15"],
                    ["ElastiCache Redis", "~$12"],
                    ["ECR + Data", "Variable"],
                  ].map(([service, cost]) => (
                    <tr
                      key={service}
                      className="border-b border-[#0f0f0f] last:border-0 hover:bg-white/[0.01] transition-colors"
                    >
                      <td className="px-6 py-4 text-[#555] text-[13px]">
                        {service}
                      </td>
                      <td className="px-6 py-4 text-[#aaa] text-[13px]">
                        {cost}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
        <TableOfContents />
      </div>
    </div>
  );
}
