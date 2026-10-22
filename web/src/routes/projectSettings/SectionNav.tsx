import { type RefObject, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface NavSection {
  id: string;
  label: string;
}

/** Slack, in pixels, so a section whose top sits exactly on the line counts as reached. */
const SLACK = 4;

/**
 * The id of the section being read, in a column that scrolls.
 *
 * A fixed line near the top would never be reached by the short sections at
 * the end, however far you scroll. So the line moves: it starts at the top of
 * the column and ends at the bottom as you scroll from one end to the other,
 * and the current section is the last one whose top is above it. Every section
 * therefore gets its turn, in order.
 */
function useActiveSection(sections: NavSection[], scroller: RefObject<HTMLElement | null>, ready: boolean) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  // A section chosen from the list stays current until the reader scrolls
  // themselves; the scrolling the click causes does not let go of it.
  const pinned = useRef<string | null>(null);

  useEffect(() => {
    const column = scroller.current;
    if (!ready || !column) return;
    let frame = 0;

    const update = () => {
      frame = 0;
      if (pinned.current) {
        setActive(pinned.current);
        return;
      }
      const range = column.scrollHeight - column.clientHeight;
      const progress = range > 0 ? Math.min(1, Math.max(0, column.scrollTop / range)) : 0;
      const line = column.getBoundingClientRect().top + progress * column.clientHeight + SLACK;
      let current = sections[0]?.id ?? "";
      for (const { id } of sections) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const release = () => {
      pinned.current = null;
      onScroll();
    };

    update();
    column.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchmove", release, { passive: true });
    window.addEventListener("keydown", release);
    return () => {
      column.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchmove", release);
      window.removeEventListener("keydown", release);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections, scroller, ready]);

  return [
    active,
    (id: string) => {
      pinned.current = id;
      setActive(id);
    },
  ] as const;
}

/**
 * Links to each section, on wide screens only, with the one being read marked.
 * They scroll the column beside them, not the address.
 */
export default function SectionNav({
  sections,
  scroller,
  ready,
}: {
  sections: NavSection[];
  /** The column that scrolls, whose position decides the marked section. */
  scroller: RefObject<HTMLElement | null>;
  ready: boolean;
}) {
  const [active, choose] = useActiveSection(sections, scroller, ready);

  return (
    <nav aria-label="Settings sections" className="hidden lg:block lg:self-start">
      <ul className="space-y-1">
        {sections.map(({ id, label }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              onClick={(event) => {
                event.preventDefault();
                choose(id);
                // Scroll the column itself; scrollIntoView would nudge the clipped page as well.
                const column = scroller.current;
                const section = document.getElementById(id);
                if (column && section) {
                  column.scrollTo({
                    top: column.scrollTop + section.getBoundingClientRect().top - column.getBoundingClientRect().top,
                    behavior: "smooth",
                  });
                }
              }}
              aria-current={active === id ? "location" : undefined}
              className={cn(
                "block rounded-hatch px-3 py-1.5 text-sm transition-colors",
                active === id ? "bg-ink/[0.06] font-medium text-ink" : "text-muted hover:text-ink",
              )}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
