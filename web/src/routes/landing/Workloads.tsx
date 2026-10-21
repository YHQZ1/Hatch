import {
  siAstro,
  siDjango,
  siExpress,
  siFastapi,
  siGo,
  siLaravel,
  siNextdotjs,
  siNestjs,
  siNodedotjs,
  siPython,
  siReact,
  siRust,
  siSpringboot,
  siSvelte,
  siVuedotjs,
  type SimpleIcon,
} from "simple-icons";
import BrandIcon from "@/components/BrandIcon";
import Badge, { type Status } from "./Badge";
import Frame from "./Frame";
import Reveal from "./Reveal";
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

const STACKS: { icon: SimpleIcon; color: string }[] = [
  { icon: siNodedotjs, color: "5FA04E" },
  { icon: siGo, color: "00ADD8" },
  { icon: siPython, color: "4B8BBE" },
  { icon: siRust, color: "F74C00" },
  { icon: siReact, color: "14A5D0" },
  { icon: siNextdotjs, color: "currentColor" },
  { icon: siVuedotjs, color: "35B27E" },
  { icon: siSvelte, color: "FF3E00" },
  { icon: siAstro, color: "FF5D01" },
  { icon: siExpress, color: "currentColor" },
  { icon: siNestjs, color: "E0234E" },
  { icon: siFastapi, color: "009688" },
  { icon: siDjango, color: "44B78B" },
  { icon: siLaravel, color: "FF2D20" },
  { icon: siSpringboot, color: "6DB33F" },
];

function StackRow({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul
      aria-hidden={hidden || undefined}
      className={`flex shrink-0 items-center ${hidden ? "motion-reduce:hidden" : ""}`}
    >
      {STACKS.map(({ icon, color }) => (
        <li
          key={icon.slug}
          className="flex items-center gap-3 px-8 text-ink/70 transition-colors hover:text-ink"
        >
          <BrandIcon icon={icon} color={color} className="h-7 w-7" />
          <span className="text-sm">{icon.title}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Workloads() {
  return (
    <Section
      id="workloads"
      title="Bring a Dockerfile. Any stack."
      tone="raised"
      intro="If it runs in a container and listens on a port, Hatch can deploy it. Web services come first."
      bleed={
        <div className="overflow-hidden border-t border-line py-8">
          <div className="flex w-max animate-marquee hover:[animation-play-state:paused] motion-reduce:w-auto motion-reduce:flex-wrap motion-reduce:justify-center">
            <StackRow />
            <StackRow hidden />
          </div>
        </div>
      }
    >
      <Frame>
      <div className="grid gap-px overflow-hidden rounded-hatch border border-line bg-line sm:grid-cols-2">
        {WORKLOADS.map((workload, i) => (
          <div
            key={workload.name}
            className="bg-base transition-colors duration-300 hover:bg-panel"
          >
            <Reveal delay={(i % 2) * 110} className="p-6 lg:p-8">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-medium tracking-tight">
                  {workload.name}
                </h3>
                <Badge status={workload.status} />
              </div>
              <p className="mt-2 leading-relaxed text-muted">{workload.body}</p>
            </Reveal>
          </div>
        ))}
      </div>
      </Frame>
    </Section>
  );
}
