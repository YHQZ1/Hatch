"use client";

import React from "react";
import {
  CodeBlock,
  DataTable,
  FeatureCard,
  InlineCode,
  NumberedCard,
  SimpleNote,
  StatusPill,
} from "../components";

const FLOW = [
  {
    title: "Deploy on a Hatch URL",
    body: "Every app gets a production URL on your Hatch wildcard domain first, so you can test the service before attaching anything custom.",
  },
  {
    title: "Add a domain to the project",
    body: "Choose the project, enter the hostname, and Hatch can reserve that domain mapping for the selected deployment.",
  },
  {
    title: "Create the DNS record",
    body: "Point the hostname at the Hatch app load balancer. Subdomains use CNAME records; apex domains usually need ALIAS or CNAME flattening.",
  },
  {
    title: "Verify and route traffic",
    body: "Once DNS resolves correctly, Hatch can attach the host rule and route requests to the project target group.",
  },
  {
    title: "Serve it over HTTPS",
    body: "Wildcard Hatch URLs use the shared certificate. Custom domains should use a verified certificate before being promoted.",
  },
];

export default function CustomDomains() {
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
              Domains
            </span>
          </div>

          <div className="flex flex-wrap gap-3 mb-8">
            <StatusPill color="green">Hatch subdomains</StatusPill>
            <StatusPill color="blue">Wildcard DNS</StatusPill>
            <StatusPill color="amber">Custom domains planned</StatusPill>
          </div>

          <h1 className="text-5xl md:text-7xl font-medium tracking-tighter text-white mb-6">
            Custom Domains
          </h1>
          <p className="text-[#888] text-xl leading-relaxed max-w-3xl font-light">
            Hatch gives each deployment a stable subdomain first. From there,
            the same routing model can support branded domains once ownership,
            DNS, and HTTPS are verified.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-12">
          <div className="min-w-0">
            <section id="today" className="mb-20">
              <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
                What Works Today
              </h2>
              <p className="text-[#777] text-base leading-relaxed max-w-3xl font-light mb-8">
                A Hatch deployment is reachable through the project subdomain,
                for example{" "}
                <InlineCode>https://my-app.hatchcloud.xyz</InlineCode>. That
                hostname resolves through the wildcard record and the load
                balancer routes it to the correct service.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FeatureCard
                  title="Hatch URL"
                  tag="default"
                  body="each project gets a predictable production hostname"
                />
                <FeatureCard
                  title="Wildcard DNS"
                  tag="dns"
                  body="one wildcard record covers generated app subdomains"
                />
                <FeatureCard
                  title="Host Routing"
                  tag="alb"
                  body="requests are matched by hostname and sent to the app"
                />
              </div>
            </section>

            <section id="flow" className="mb-20">
              <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
                Custom Domain Flow
              </h2>
              <p className="text-[#777] text-base leading-relaxed max-w-3xl font-light mb-8">
                This is the product path Hatch should expose when custom domains
                become a first-class feature.
              </p>
              <div className="border border-[#111] bg-[#050505] rounded-[2px]">
                {FLOW.map((step, index) => (
                  <NumberedCard
                    key={step.title}
                    index={index + 1}
                    title={step.title}
                    body={step.body}
                  />
                ))}
              </div>
            </section>

            <section id="records" className="mb-20">
              <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
                DNS Records
              </h2>
              <p className="text-[#777] text-base leading-relaxed max-w-3xl font-light">
                The exact target comes from your Hatch user-app infrastructure.
                For local development, you can inspect it from Terraform outputs
                or the AWS load balancer page.
              </p>

              <DataTable
                columns={["Hostname", "Record", "Target", "Use case"]}
                rows={[
                  [
                    "*.hatchcloud.xyz",
                    "CNAME",
                    "user-app ALB DNS name",
                    "Generated Hatch subdomains",
                  ],
                  [
                    "www.example.com",
                    "CNAME",
                    "user-app ALB DNS name",
                    "Custom subdomain",
                  ],
                  [
                    "example.com",
                    "ALIAS / ANAME",
                    "user-app ALB DNS name",
                    "Apex custom domain",
                  ],
                ]}
              />

              <CodeBlock
                filename="check-dns.sh"
                code={`nslookup my-app.hatchcloud.xyz
curl -i https://my-app.hatchcloud.xyz`}
              />

              <SimpleNote tone="warning">
                If a hostname still points at the old load balancer, the
                deployment can look live in Hatch but return the default
                &quot;No project mapped&quot; response in the browser.
              </SimpleNote>
            </section>

            <section id="https" className="mb-20">
              <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
                HTTPS
              </h2>
              <p className="text-[#777] text-base leading-relaxed max-w-3xl font-light mb-8">
                Hatch subdomains are covered by the wildcard certificate for the
                app domain. Branded custom domains need their own certificate
                before Hatch can safely serve them over HTTPS.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FeatureCard
                  title="Generated subdomains"
                  tag="ready"
                  body="covered by the shared wildcard certificate"
                />
                <FeatureCard
                  title="External domains"
                  tag="verify"
                  body="require ownership validation and certificate attachment"
                />
              </div>
            </section>
          </div>

          <aside className="hidden xl:block">
            <div className="sticky top-28 border border-[#111] bg-[#050505] rounded-[2px] p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#333] font-bold mb-4">
                On This Page
              </p>
              <nav className="flex flex-col gap-3 text-sm font-mono">
                {[
                  ["Today", "#today"],
                  ["Flow", "#flow"],
                  ["DNS Records", "#records"],
                  ["HTTPS", "#https"],
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
