import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { prefersReducedMotion } from "@/lib/motion";

export type Theme = "dark" | "light";

/**
 * Recreates every running CSS animation at its current position. Some
 * browsers leave animations stuck after a view transition; this restarts
 * their clocks without a visible jump.
 */
function resyncAnimations() {
  for (const animation of document.getAnimations()) {
    if (!(animation instanceof CSSAnimation) || animation.playState !== "running") {
      continue;
    }
    const position = animation.currentTime;
    animation.cancel();
    animation.play();
    animation.currentTime = position;
  }
}

const STORAGE_KEY = "hatch-theme";
const DURATION_MS = 450;

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/**
 * The theme of the landing and sign-in pages. Switching uses the View Transitions API so the new
 * theme spreads from the click point as a circle, with every element changing
 * together; without the API (or with reduced motion) it switches instantly.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  const toggle = useCallback(
    (origin: { x: number; y: number }) => {
      const next: Theme = theme === "dark" ? "light" : "dark";
      const apply = () => {
        flushSync(() => setTheme(next));
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // The choice just won't be remembered.
        }
      };

      if (!("startViewTransition" in document) || prefersReducedMotion()) {
        apply();
        return;
      }

      const root = document.documentElement;
      const reach = Math.hypot(
        Math.max(origin.x, window.innerWidth - origin.x),
        Math.max(origin.y, window.innerHeight - origin.y),
      );
      root.classList.add("theme-switching");
      const transition = document.startViewTransition(apply);
      void transition.ready.then(() =>
        root.animate(
          {
            clipPath: [
              `circle(0px at ${origin.x}px ${origin.y}px)`,
              `circle(${reach}px at ${origin.x}px ${origin.y}px)`,
            ],
          },
          {
            duration: DURATION_MS,
            easing: "cubic-bezier(0.65, 0, 0.35, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        ),
      );
      void transition.finished.finally(() => {
        root.classList.remove("theme-switching");
        requestAnimationFrame(resyncAnimations);
      });
    },
    [theme],
  );

  return { theme, toggle };
}
