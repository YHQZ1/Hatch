import Section from "./Section";

const STEPS = [
  {
    title: "Sign in with GitHub",
    body: "Choose the repositories Hatch may read. Nothing else is requested.",
  },
  {
    title: "Connect your AWS account",
    body: "One click to grant Hatch a scoped role. No access keys to copy or store.",
  },
  {
    title: "Deploy",
    body: "Pick a repository and branch. Review the cost estimate, then deploy and watch the build live.",
  },
  {
    title: "Operate and tear down",
    body: "Roll back, set budgets and expiry, and delete a service with proof that nothing is left behind.",
  },
];

export default function HowItWorks() {
  return (
    <Section id="how-it-works" title="From repository to running service.">
      <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <span className="flex h-8 w-8 items-center justify-center rounded-hatch border border-line-strong font-mono text-sm text-accent">
              {i + 1}
            </span>
            <h3 className="mt-5 font-medium">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
