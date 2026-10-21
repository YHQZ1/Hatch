import { useEffect, useState } from "react";

type Line = { text: string; delay: number; tone?: "dim" | "strong" };

/** An illustration of the flow Hatch is being built to deliver. */
const SCRIPT: Line[] = [
  { text: "Dockerfile          node:24, port 3000", delay: 700, tone: "dim" },
  { text: "Estimated cost      $14.20 per month", delay: 900 },
  { text: "Budget alarm        $20 per month", delay: 350, tone: "dim" },
  { text: "Pause when idle     after 30 minutes", delay: 350, tone: "dim" },
  { text: "Expires             in 7 days", delay: 350, tone: "dim" },
  { text: "Building image", delay: 900 },
  { text: "Pushing to your registry", delay: 1100 },
  { text: "Starting service", delay: 900 },
  { text: "Health check passed", delay: 900 },
  { text: "Live at https://storefront.example.com", delay: 500, tone: "strong" },
];

const COMMAND = "$ hatch deploy storefront";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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
      <div className="overflow-hidden rounded-hatch border border-line-strong bg-panel">
        <div className="flex h-10 items-center border-b border-line px-4 text-xs text-faint">
          hatch deploy
        </div>
        <div
          className="min-h-[340px] px-5 py-5 font-mono text-[13px] leading-7"
          aria-label="Example deploy session"
        >
          <div className="text-white">{COMMAND}</div>
          {SCRIPT.slice(0, shown).map((line) => (
            <div
              key={line.text}
              className={`whitespace-pre-wrap ${
                line.tone === "strong"
                  ? "mt-3 font-medium text-accent"
                  : line.tone === "dim"
                    ? "text-muted"
                    : "text-white/90"
              }`}
            >
              {line.text}
            </div>
          ))}
          {shown < SCRIPT.length && (
            <span className="mt-1 inline-block h-4 w-2 animate-blink bg-white/70 align-middle" />
          )}
        </div>
      </div>
      <figcaption className="mt-3 text-xs text-faint">
        An illustration of the target flow. Deploys are in development.
      </figcaption>
    </figure>
  );
}
