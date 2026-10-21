import {
  siAstro,
  siDjango,
  siExpress,
  siFastapi,
  siGo,
  siLaravel,
  siNextdotjs,
  siNodedotjs,
  siPython,
  siReact,
  siRust,
  siSpringboot,
  type SimpleIcon,
} from "simple-icons";
import BrandIcon from "@/components/BrandIcon";
import Badge, { type Status } from "./Badge";
import Section from "./Section";

const WORKLOADS: { name: string; body: string; status: Status }[] = [
  {
    name: "Web services",
    body: "Frontends and backends that listen on a port, built from your Dockerfile.",
    status: "development",
  },
  {
    name: "Background workers",
    body: "Long-running processes that pull jobs from a queue.",
    status: "planned",
  },
  {
    name: "Cron jobs",
    body: "Scheduled containers that run and exit.",
    status: "planned",
  },
  {
    name: "Managed databases",
    body: "Postgres provisioned and backed up alongside your services.",
    status: "planned",
  },
];

const STACKS: { icon: SimpleIcon }[] = [
  { icon: siNodedotjs },
  { icon: siGo },
  { icon: siPython },
  { icon: siRust },
  { icon: siReact },
  { icon: siNextdotjs },
  { icon: siAstro },
  { icon: siExpress },
  { icon: siFastapi },
  { icon: siDjango },
  { icon: siLaravel },
  { icon: siSpringboot },
];

export default function Workloads() {
  return (
    <Section
      id="workloads"
      title="Bring a Dockerfile. Any stack."
      intro="If it runs in a container and listens on a port, Hatch can deploy it. Web services come first."
    >
      <div className="grid gap-px overflow-hidden rounded-hatch border border-line bg-line sm:grid-cols-2">
        {WORKLOADS.map((workload) => (
          <div key={workload.name} className="bg-black p-6">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-medium">{workload.name}</h3>
              <Badge status={workload.status} />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {workload.body}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-x-10 gap-y-6">
        {STACKS.map(({ icon }) => (
          <BrandIcon
            key={icon.slug}
            icon={icon}
            color="8B8B95"
            className="h-7 w-7 opacity-70 transition-opacity hover:opacity-100"
          />
        ))}
      </div>
    </Section>
  );
}
