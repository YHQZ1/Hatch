import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/** A fine line grid that drifts slower than the page as it scrolls. */
export default function Backdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const update = () => {
      const element = ref.current;
      if (!element) return;
      const top = element.getBoundingClientRect().top;
      element.style.backgroundPositionY = `${-top * 0.35}px`;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="bg-line-grid pointer-events-none absolute inset-0"
    />
  );
}
