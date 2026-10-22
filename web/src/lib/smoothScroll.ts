import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { prefersReducedMotion } from "./motion";

/** Height of the sticky landing header, so anchored sections clear it. */
const HEADER_OFFSET = 64;

let active: Lenis | null = null;

/**
 * Eases wheel and touch scrolling while the calling page is mounted. Visitors
 * who ask for reduced motion keep native scrolling.
 */
export function useSmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return;

    const lenis = new Lenis({ lerp: 0.1 });
    active = lenis;

    let frame = requestAnimationFrame(function tick(time) {
      lenis.raf(time);
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      if (active === lenis) active = null;
    };
  }, []);
}

/** Scrolls to the element with the given id, smoothly when enabled. */
export function scrollToSection(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  if (active) {
    active.scrollTo(element, { offset: -HEADER_OFFSET });
  } else {
    element.scrollIntoView();
  }
}
