import Reveal from "./Reveal";
import ScrollLine from "./ScrollLine";
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
    <Section
      id="how-it-works"
      title="From repository to running service."
      grid
    >
      <ol className="relative grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
        <ScrollLine className="left-0 right-0 top-4 hidden lg:block" />
        {STEPS.map((step, i) => (
          <li key={step.title} className="relative">
            <Reveal delay={i * 110}>
              <span className="flex h-8 w-8 items-center justify-center rounded-hatch border border-line-strong bg-base text-sm font-medium text-muted transition-colors duration-700 group-data-[visible=true]/reveal:border-accent group-data-[visible=true]/reveal:text-accent">
                {i + 1}
              </span>
              <h3 className="mt-6 text-lg font-medium tracking-tight">
                {step.title}
              </h3>
              <p className="mt-2 leading-relaxed text-muted">{step.body}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}
