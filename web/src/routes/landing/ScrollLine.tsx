import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/** A thin line that fills with the accent colour as it scrolls up the viewport. */
export default function ScrollLine({ className = "" }: { className?: string }) {
  const line = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = fill.current;
    const track = line.current;
    if (!element || !track) return;
    if (prefersReducedMotion()) {
      element.style.transform = "scaleX(1)";
      return;
    }
    const update = () => {
      const top = track.getBoundingClientRect().top;
      const progress = (window.innerHeight * 0.8 - top) / (window.innerHeight * 0.45);
      element.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
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
    <div ref={line} aria-hidden className={`absolute h-px bg-line ${className}`}>
      <div
        ref={fill}
        style={{ transform: "scaleX(0)" }}
        className="h-full origin-left bg-accent"
      />
    </div>
  );
}
