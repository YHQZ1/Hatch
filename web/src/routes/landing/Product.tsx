import Badge, { type Status } from "./Badge";
import Section from "./Section";

const PILLARS: { title: string; body: string; status: Status }[] = [
  {
    title: "Your account, your bill",
    body: "Hatch deploys into an AWS account you own. Your code, your data and your invoices stay with you, and you pay AWS directly at AWS prices.",
    status: "planned",
  },
  {
    title: "Guardrails against surprise bills",
    body: "See an estimate before you deploy, get alarms against a budget, pause what sits idle, and give anything temporary an expiry date.",
    status: "planned",
  },
  {
    title: "Dockerfile in, URL out",
    body: "Point Hatch at a repository with a Dockerfile. It builds the image, runs it and gives you a URL, with live build logs while it works.",
    status: "development",
  },
];

export default function Product() {
  return (
    <Section
      id="product"
      title="The convenience of a platform, on infrastructure you own."
      intro="Hosted platforms are easy until the invoice arrives. Hatch keeps the push-to-deploy workflow and moves the compute, and the control, into your cloud."
    >
      <div className="grid gap-px overflow-hidden rounded-hatch border border-line bg-line md:grid-cols-3">
        {PILLARS.map((pillar) => (
          <div key={pillar.title} className="bg-black p-8">
            <Badge status={pillar.status} />
            <h3 className="mt-5 text-lg font-medium">{pillar.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {pillar.body}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}
