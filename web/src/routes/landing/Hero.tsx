import Button from "./Button";
import { DOCS_URL, REPO_URL } from "./links";
import Terminal from "./Terminal";

export default function Hero() {
  return (
    <section id="top" className="border-b border-line">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
        <div className="animate-rise">
          <p className="mb-6 text-sm font-medium text-accent">
            Open source and MIT licensed
          </p>
          <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Render-style deploys, in your own AWS account.
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted">
            Point Hatch at a Dockerfile and get a URL. It runs on infrastructure
            you own, and cost guardrails are built in: an estimate before every
            deploy, budget alarms, idle pause, expiry, and verified teardown.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button href={REPO_URL}>View on GitHub</Button>
            <Button variant="secondary" href={DOCS_URL}>
              Read the docs
            </Button>
          </div>
        </div>
        <div className="animate-rise [animation-delay:120ms]">
          <Terminal />
        </div>
      </div>
    </section>
  );
}
