import { siGithub } from "simple-icons";
import BrandIcon from "@/components/BrandIcon";
import { scrollToSection } from "@/lib/smoothScroll";
import Button from "./Button";
import { REPO_URL } from "./links";

const NAV = [
  { id: "product", label: "Product" },
  { id: "guardrails", label: "Guardrails" },
  { id: "how-it-works", label: "How it works" },
  { id: "roadmap", label: "Roadmap" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-black/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-10">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection("top");
            }}
            className="flex items-center gap-2.5"
          >
            <img src="/hatch.svg" alt="" className="h-6 w-6" />
            <span className="text-lg font-semibold tracking-tight">Hatch</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm md:flex">
            {NAV.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(item.id);
                }}
                className="text-muted transition-colors hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden h-10 items-center gap-2 rounded-hatch px-3 text-sm text-muted transition-colors hover:text-white sm:inline-flex"
          >
            <BrandIcon icon={siGithub} color="FFFFFF" className="h-4 w-4" />
            GitHub
          </a>
          <Button variant="secondary" to="/auth">
            Sign in
          </Button>
        </div>
      </div>
    </header>
  );
}
