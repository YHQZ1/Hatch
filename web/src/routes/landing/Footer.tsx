import { scrollToSection } from "@/lib/smoothScroll";
import Button from "./Button";
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

const LINK = "text-muted transition-colors hover:text-white";

export default function Footer() {
  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-6 py-20 md:flex-row md:items-center md:justify-between">
          <h2 className="max-w-xl text-balance text-3xl font-semibold tracking-tight">
            Follow along, or run it yourself.
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button href={REPO_URL}>View on GitHub</Button>
            <Button variant="secondary" href={DOCS_URL}>
              Read the docs
            </Button>
          </div>
        </div>
      </section>

      <footer>
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <img src="/hatch.svg" alt="" className="h-5 w-5" />
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
        </div>
        <div className="border-t border-line">
          <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-faint">
            Open source under the MIT license.
          </div>
        </div>
      </footer>
    </>
  );
}
