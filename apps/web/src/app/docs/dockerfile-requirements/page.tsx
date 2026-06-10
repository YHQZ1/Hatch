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

export default function DockerfileRequirements() {
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
                Dockerfile
              </span>
            </div>
            <h1 className="text-5xl md:text-7xl font-medium tracking-tighter text-white mb-6">
              Dockerfile Requirements
            </h1>
            <p className="text-[#888] text-xl leading-relaxed max-w-3xl font-light">
              Hatch is Dockerfile-first. If your app can build into a container
              and serve traffic on a port, Hatch can deploy it.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-10">
              <StatusPill color="green">Container native</StatusPill>
              <StatusPill color="blue">No framework lock-in</StatusPill>
              <StatusPill color="amber">Port matters</StatusPill>
            </div>
          </div>

          <section className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Runtime contract
            </h2>
            <p className="text-[#888] text-base leading-relaxed mb-8 font-light">
              Hatch does not need to understand your framework. It only needs a
              container that starts reliably and responds over HTTP.
            </p>
            <DataTable
              columns={["Requirement", "Why it matters"]}
              rows={[
                [
                  "Dockerfile",
                  "Hatch builds the image from the Dockerfile path configured on the project.",
                ],
                [
                  "0.0.0.0 binding",
                  "The load balancer cannot reach a process bound only to localhost.",
                ],
                [
                  "Known port",
                  "The project port is used for target group traffic and health checks.",
                ],
                [
                  "Health path",
                  "Hatch waits for a healthy target before marking the deployment live.",
                ],
              ]}
            />
          </section>

          <section className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Common runtime shapes
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FeatureCard
                title="Static frontend"
                body="Build assets, serve them through NGINX, expose port 80"
                tag="nginx"
              />
              <FeatureCard
                title="Node app"
                body="Install dependencies, set HOST and PORT, start the server"
                tag="node"
              />
              <FeatureCard
                title="Go API"
                body="Compile a binary, copy it into a small image, expose the API port"
                tag="go"
              />
              <FeatureCard
                title="Python API"
                body="Run ASGI/WSGI on 0.0.0.0 with a configured port"
                tag="python"
              />
            </div>
          </section>

          <section className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Static site example
            </h2>
            <CodeBlock
              filename="Dockerfile"
              code={`FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80`}
            />
            <SimpleNote>
              Hatch detects <InlineCode>EXPOSE 80</InlineCode> and uses it as
              the service port. The default health check path{" "}
              <InlineCode>/</InlineCode> should work for most static sites.
            </SimpleNote>
          </section>

          <section className="mb-20">
            <h2 className="text-2xl font-medium text-white mb-4 tracking-tight">
              Node server example
            </h2>
            <CodeBlock
              filename="Dockerfile"
              code={`FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]`}
            />
            <SimpleNote tone="warning">
              If your app ignores <InlineCode>HOST</InlineCode>, configure it in
              framework code. Listening on localhost is the most common cause of
              healthy local builds that fail in production.
            </SimpleNote>
          </section>
        </main>
      </div>
    </div>
  );
}
