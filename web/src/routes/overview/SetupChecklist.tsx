import { Link } from "react-router";
import { cn } from "@/lib/cn";

export interface SetupStep {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  action: { label: string; href: string; external?: boolean };
}

/**
 * A short list of what is left to do before the first deploy. It is only
 * shown until every step is done, and lists only steps that exist today.
 */
export default function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const doneCount = steps.filter((step) => step.done).length;
  const nextId = steps.find((step) => !step.done)?.id;

  return (
    <section className="rounded-hatch border border-line-strong bg-base">
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[1rem] font-semibold tracking-tight">Get started</h2>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
            {doneCount} of {steps.length}
          </p>
        </div>
        <div aria-hidden className="mt-3 h-px w-full bg-line">
          <div
            className="h-px bg-accent transition-[width] duration-500"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
      </div>

      <ol>
        {steps.map((step) => (
          <li
            key={step.id}
            className="flex items-start gap-3 border-b border-line px-5 py-4 last:border-b-0"
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] border",
                step.done
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line-strong text-transparent",
              )}
            >
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M2.5 6.5l2.2 2.2L9.5 3.5" strokeLinecap="square" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", step.done && "text-muted line-through decoration-faint")}>
                {step.title}
              </p>
              {!step.done && (
                <p className="mt-1 text-sm leading-relaxed text-muted">{step.detail}</p>
              )}
              {step.id === nextId &&
                (step.action.external ? (
                  <a
                    href={step.action.href}
                    className="mt-3 inline-flex h-8 items-center rounded-hatch bg-accent px-3 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
                  >
                    {step.action.label}
                  </a>
                ) : (
                  <Link
                    to={step.action.href}
                    className="mt-3 inline-flex h-8 items-center rounded-hatch bg-accent px-3 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
                  >
                    {step.action.label}
                  </Link>
                ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Holds the checklist's space until it is known whether setup is finished. */
export function SetupChecklistSkeleton() {
  return (
    <div aria-hidden className="rounded-hatch border border-line-strong bg-base">
      <div className="border-b border-line px-5 py-4">
        <div className="h-5 w-28 animate-pulse rounded-hatch bg-line" />
        <div className="mt-4 h-px w-full bg-line" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 border-b border-line px-5 py-4 last:border-b-0">
          <div className="h-5 w-5 shrink-0 animate-pulse rounded-[2px] bg-line" />
          <div className="w-full space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded-hatch bg-line" />
            {i > 0 && <div className="h-3 w-full animate-pulse rounded-hatch bg-line/60" />}
          </div>
        </div>
      ))}
    </div>
  );
}
