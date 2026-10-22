import Backdrop from "./Backdrop";
import Button from "./Button";
import GitHubButton from "./GitHubButton";
import Container from "@/components/Container";
import { DOCS_URL } from "./links";
import Terminal from "./Terminal";

const rise = (ms: number) => ({ animationDelay: `${ms}ms` });

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden border-b border-line">
      <Backdrop />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px overflow-hidden"
      >
        <div className="h-px w-64 animate-sweep bg-accent" />
      </div>
      <Container className="relative grid items-center gap-14 py-20 lg:grid-cols-2 lg:gap-20 lg:py-32">
        <div>
          <p
            className="animate-rise mb-6 text-sm font-medium text-accent"
            style={rise(0)}
          >
            Open source and MIT licensed
          </p>
          <h1
            className="animate-rise text-balance text-5xl font-semibold leading-[1.04] tracking-[-0.03em] md:text-6xl xl:text-7xl"
            style={rise(80)}
          >
            Render-style deploys, in your own AWS account.
          </h1>
          <p
            className="animate-rise mt-7 max-w-xl text-pretty text-lg leading-relaxed text-muted"
            style={rise(180)}
          >
            Point Hatch at a Dockerfile and get a URL. It runs on infrastructure
            you own, and cost guardrails are built in: an estimate before every
            deploy, budget alarms, idle pause, expiry, and verified teardown.
          </p>
          <div className="animate-rise mt-10 flex flex-wrap gap-3" style={rise(280)}>
            <GitHubButton />
            <Button variant="secondary" href={DOCS_URL}>
              Read the docs
            </Button>
          </div>
        </div>
        <div className="animate-rise" style={rise(360)}>
          <Terminal />
        </div>
      </Container>
    </section>
  );
}
