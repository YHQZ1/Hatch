import type { ReactNode } from "react";
import Badge, { type Status } from "./Badge";
import Frame from "./Frame";
import Reveal from "./Reveal";
import Section from "./Section";
import { AccountDiagram, BudgetMeter, DockerfileToUrl } from "./Visuals";

const PILLARS: {
  title: string;
  body: string;
  status: Status;
  visual: ReactNode;
}[] = [
  {
    title: "Your account, your bill",
    body: "Hatch deploys into an AWS account you own. Your code, your data and your invoices stay with you, and you pay AWS directly at AWS prices.",
    status: "planned",
    visual: <AccountDiagram />,
  },
  {
    title: "Guardrails against surprise bills",
    body: "See an estimate before you deploy, get alarms against a budget, pause what sits idle, and give anything temporary an expiry date.",
    status: "planned",
    visual: <BudgetMeter />,
  },
  {
    title: "Dockerfile in, URL out",
    body: "Point Hatch at a repository with a Dockerfile. It builds the image, runs it and gives you a URL, with live build logs while it works.",
    status: "development",
    visual: <DockerfileToUrl />,
  },
];

export default function Product() {
  return (
    <Section
      id="product"
      title="The convenience of a platform, on infrastructure you own."
      intro="Hosted platforms are easy until the invoice arrives. Hatch keeps the push-to-deploy workflow and moves the compute, and the control, into your cloud."
    >
      <Frame>
        <div className="grid gap-px overflow-hidden rounded-hatch border border-line bg-line md:grid-cols-3">
          {PILLARS.map((pillar, i) => (
            <div
              key={pillar.title}
              className="bg-base transition-colors duration-300 hover:bg-panel"
            >
              <Reveal delay={i * 110}>
                <div className="flex h-52 items-center justify-center border-b border-line bg-panel px-6">
                  {pillar.visual}
                </div>
                <div className="p-8 lg:p-10">
                  <Badge status={pillar.status} />
                  <h3 className="mt-6 text-xl font-medium tracking-tight">
                    {pillar.title}
                  </h3>
                  <p className="mt-3 leading-relaxed text-muted">
                    {pillar.body}
                  </p>
                </div>
              </Reveal>
            </div>
          ))}
        </div>
      </Frame>
    </Section>
  );
}
