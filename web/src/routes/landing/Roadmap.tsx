import Badge, { type Status } from "./Badge";
import { ROADMAP_URL } from "./links";
import Frame from "./Frame";
import Reveal from "./Reveal";
import Section from "./Section";

const COLUMNS: { status: Status; heading: string; items: string[] }[] = [
  {
    status: "available",
    heading: "Works today",
    items: [
      "Open-source control plane you can run yourself",
      "Web interface served from the same binary",
      "Versioned database migrations",
      "Continuous integration and security scanning",
    ],
  },
  {
    status: "development",
    heading: "Being built now",
    items: [
      "Sign in with a GitHub App",
      "Dockerfile builds and deploys on local Docker",
      "Live build and runtime logs",
    ],
  },
  {
    status: "planned",
    heading: "Next",
    items: [
      "Connect an AWS account",
      "Run services in your account",
      "All cost guardrails",
      "Workers, cron jobs and databases",
    ],
  },
];

export default function Roadmap() {
  return (
    <Section
      id="roadmap"
      title="Built in the open, and still being rebuilt."
      tone="tint"
      intro="Hatch is moving from a hosted prototype to the product described on this page. This is where it stands."
    >
      <Frame>
      <div className="grid gap-px overflow-hidden rounded-hatch border border-line bg-line md:grid-cols-3">
        {COLUMNS.map((column, i) => (
          <div key={column.heading} className="bg-base">
            <Reveal delay={i * 110} className="p-8 lg:p-10">
              <Badge status={column.status} />
              <h3 className="mt-6 text-xl font-medium tracking-tight">
                {column.heading}
              </h3>
              <ul className="mt-5 space-y-3 leading-relaxed text-muted">
                {column.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Reveal>
          </div>
        ))}
      </div>
      </Frame>
      <a
        href={ROADMAP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 inline-block text-sm text-accent transition-colors hover:text-accent-hover"
      >
        Read the full roadmap
      </a>
    </Section>
  );
}
