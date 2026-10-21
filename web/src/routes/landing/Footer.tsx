import { scrollToSection } from "@/lib/smoothScroll";
import Backdrop from "./Backdrop";
import Button from "./Button";
import Container from "./Container";
import GitHubButton from "./GitHubButton";
import Reveal from "./Reveal";
import {
  ARCHITECTURE_URL,
  DOCS_URL,
  ISSUES_URL,
  REPO_URL,
  ROADMAP_URL,
} from "./links";

const EXTERNAL = [
  { label: "Documentation", href: DOCS_URL },
  { label: "Architecture", href: ARCHITECTURE_URL },
  { label: "Roadmap", href: ROADMAP_URL },
  { label: "Issues", href: ISSUES_URL },
  { label: "Source", href: REPO_URL },
];

const LINK = "text-muted transition-colors hover:text-ink";

export default function Footer() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-line bg-tint">
        <Backdrop />
        <Container className="relative py-24 lg:py-32">
          <Reveal className="flex flex-col items-start gap-8 md:flex-row md:items-center md:justify-between">
            <h2 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
              Follow along, or run it yourself.
            </h2>
            <div className="flex flex-wrap gap-3">
              <GitHubButton />
              <Button variant="secondary" href={DOCS_URL}>
                Read the docs
              </Button>
            </div>
          </Reveal>
        </Container>
      </section>

      <footer>
        <Container className="grid gap-10 py-14 sm:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <img src="/hatch.svg" alt="" className="theme-logo h-5 w-5" />
              <span className="font-semibold tracking-tight">Hatch</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              Render-style deploys in your own AWS account, with cost
              guardrails built in.
            </p>
          </div>
          <nav className="flex flex-col gap-3 text-sm" aria-label="Product">
            <span className="font-medium">Product</span>
            {[
              ["product", "Overview"],
              ["guardrails", "Guardrails"],
              ["how-it-works", "How it works"],
              ["workloads", "What you can deploy"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(id);
                }}
                className={LINK}
              >
                {label}
              </a>
            ))}
          </nav>
          <nav className="flex flex-col gap-3 text-sm" aria-label="Project">
            <span className="font-medium">Project</span>
            {EXTERNAL.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </Container>
        <div className="border-t border-line">
          <Container className="py-6 text-xs text-faint">
            Open source under the MIT license.
          </Container>
        </div>
      </footer>
    </>
  );
}
