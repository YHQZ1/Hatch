import type { ReactNode } from "react";
import Backdrop from "./Backdrop";
import Container from "./Container";
import Reveal from "./Reveal";

const TONES = { base: "bg-base", raised: "bg-panel", tint: "bg-tint" };

/** A full-width band with the standard page gutter and a heading block. */
export default function Section({
  id,
  title,
  intro,
  tone = "base",
  grid = false,
  children,
  bleed,
}: {
  id: string;
  title: string;
  intro?: string;
  tone?: "base" | "raised" | "tint";
  /** Draws the line grid behind the section. */
  grid?: boolean;
  children: ReactNode;
  /** Content that runs the full width of the band, past the page gutter. */
  bleed?: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`relative scroll-mt-16 overflow-hidden border-b border-line ${TONES[tone]}`}
    >
      {grid && <Backdrop />}
      <Container className="relative py-20 lg:py-28">
        <Reveal className="mb-14 max-w-3xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">
            {title}
          </h2>
          {intro && (
            <p className="mt-5 text-pretty text-lg leading-relaxed text-muted">
              {intro}
            </p>
          )}
        </Reveal>
        {children}
      </Container>
      {bleed}
    </section>
  );
}
