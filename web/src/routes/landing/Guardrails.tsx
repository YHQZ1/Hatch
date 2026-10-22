import Badge from "./Badge";
import Reveal from "./Reveal";
import Section from "./Section";
import { EstimateCard } from "./Visuals";

const GUARDRAILS = [
  {
    title: "Cost estimate before you deploy",
    body: "Every deploy shows what it is expected to cost per month before anything is created.",
  },
  {
    title: "Budget alarms",
    body: "Set a monthly budget per service. Hatch alerts you as spend approaches it.",
  },
  {
    title: "Pause when idle",
    body: "Services that see no traffic scale down on their own, and wake when needed.",
  },
  {
    title: "Expiry dates",
    body: "Preview and test environments can be given a lifetime, then removed automatically.",
  },
  {
    title: "Verified teardown",
    body: "Everything Hatch creates is tagged and recorded. When you delete a service, Hatch checks that nothing is left billing.",
  },
];

export default function Guardrails() {
  return (
    <Section
      id="guardrails"
      title="Surprise bills are a platform bug."
      tone="raised"
      intro="Running in your own account means the bill is yours, so Hatch is built to keep it predictable."
    >
      <div className="grid items-start gap-10 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
      <ul className="divide-y divide-line overflow-hidden rounded-hatch border border-line bg-base">
        {GUARDRAILS.map((item, i) => (
          <li
            key={item.title}
            className="relative transition-colors duration-300 before:absolute before:inset-y-0 before:left-0 before:w-px before:origin-top before:scale-y-0 before:bg-accent before:transition-transform before:duration-300 hover:bg-panel hover:before:scale-y-100"
          >
            <Reveal
              delay={i * 70}
              className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:justify-between sm:gap-8 lg:px-10 lg:py-7"
            >
              <div className="max-w-2xl">
                <h3 className="text-lg font-medium tracking-tight">
                  {item.title}
                </h3>
                <p className="mt-1.5 leading-relaxed text-muted">{item.body}</p>
              </div>
              <Badge status="planned" />
            </Reveal>
          </li>
        ))}
      </ul>
      <Reveal delay={150} className="lg:sticky lg:top-24">
        <EstimateCard />
      </Reveal>
      </div>
    </Section>
  );
}
