import type { ReactNode } from "react";

/** A full-width band with the standard page gutter and a heading block. */
export default function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16 border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
        <div className="mb-12 max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            {title}
          </h2>
          {intro && (
            <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">
              {intro}
            </p>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}
