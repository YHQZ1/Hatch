import Badge, { type Status } from "./Badge";
import { ROADMAP_URL } from "./links";
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
      intro="Hatch is moving from a hosted prototype to the product described on this page. This is where it stands."
    >
      <div className="grid gap-px overflow-hidden rounded-hatch border border-line bg-line md:grid-cols-3">
        {COLUMNS.map((column) => (
          <div key={column.heading} className="bg-black p-8">
            <Badge status={column.status} />
            <h3 className="mt-5 font-medium">{column.heading}</h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
              {column.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
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
