import { useEffect, useRef } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import type { Theme } from "@/lib/theme";
import { scrollToSection } from "@/lib/smoothScroll";
import Button from "./Button";
import Container from "@/components/Container";


const NAV = [
  { id: "product", label: "Product" },
  { id: "guardrails", label: "Guardrails" },
  { id: "how-it-works", label: "How it works" },
  { id: "roadmap", label: "Roadmap" },
];

export default function Header({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: (origin: { x: number; y: number }) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);

  // Page scroll progress, drawn along the bottom edge of the header.
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? window.scrollY / max : 0;
      if (bar.current) bar.current.style.transform = `scaleX(${progress})`;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-base/80 backdrop-blur-md">
      <div
        ref={bar}
        aria-hidden
        style={{ transform: "scaleX(0)" }}
        className="absolute inset-x-0 -bottom-px h-px origin-left bg-accent"
      />
      <Container className="flex h-16 items-center justify-between">
        <div className="flex items-center gap-10">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection("top");
            }}
            className="flex items-center gap-2.5"
          >
            <img src="/hatch.svg" alt="" className="theme-logo h-6 w-6" />
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
                className="text-muted transition-colors hover:text-ink"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <Button variant="secondary" to="/auth">
            Sign in
          </Button>
        </div>
      </Container>
    </header>
  );
}
