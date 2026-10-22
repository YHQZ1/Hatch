import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import { COMMAND, SCRIPT } from "./terminalScript";

export default function Terminal() {
  const [shown, setShown] = useState(() =>
    prefersReducedMotion() ? SCRIPT.length : 0,
  );

  useEffect(() => {
    if (shown >= SCRIPT.length) return;
    const timer = window.setTimeout(
      () => setShown(shown + 1),
      SCRIPT[shown].delay,
    );
    return () => window.clearTimeout(timer);
  }, [shown]);

  return (
    <figure className="m-0">
      <div className="relative">
      <div
        aria-hidden
        className="absolute inset-0 hidden translate-x-4 translate-y-4 rounded-hatch border border-accent/30 md:block"
      />
      <div className="relative overflow-hidden rounded-hatch border border-line-strong bg-panel">
        <div className="flex h-10 items-center border-b border-line px-4 text-xs text-faint">
          hatch deploy
        </div>
        <div
          className="min-h-[340px] px-5 py-5 font-mono text-[13px] leading-7"
          aria-label="Example deploy session"
        >
          <div className="text-ink">{COMMAND}</div>
          {SCRIPT.slice(0, shown).map((line) => (
            <div
              key={line.text}
              className={`whitespace-pre-wrap ${
                line.tone === "strong"
                  ? "mt-3 font-medium text-accent"
                  : line.tone === "dim"
                    ? "text-muted"
                    : "text-ink/90"
              }`}
            >
              {line.text}
            </div>
          ))}
          {shown < SCRIPT.length && (
            <span className="mt-1 inline-block h-4 w-2 animate-blink bg-ink/70 align-middle" />
          )}
        </div>
      </div>
      </div>
      <figcaption className="mt-3 text-xs text-faint md:mt-8">
        An illustration of the target flow. Deploys are in development.
      </figcaption>
    </figure>
  );
}
