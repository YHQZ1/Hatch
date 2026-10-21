import Badge from "./Badge";
import Section from "./Section";

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
      intro="Running in your own account means the bill is yours, so Hatch is built to keep it predictable."
    >
      <ul className="divide-y divide-line rounded-hatch border border-line">
        {GUARDRAILS.map((item) => (
          <li
            key={item.title}
            className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:justify-between sm:gap-8"
          >
            <div className="max-w-2xl">
              <h3 className="font-medium">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {item.body}
              </p>
            </div>
            <Badge status="planned" />
          </li>
        ))}
      </ul>
    </Section>
  );
}
