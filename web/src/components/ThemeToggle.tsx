import type { Theme } from "./useTheme";

/** Switches the landing page theme; the change spreads out from this button. */
export default function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle: (origin: { x: number; y: number }) => void;
}) {
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      aria-label={`Switch to ${next} mode`}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onToggle({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }}
      className="inline-flex h-10 w-10 items-center justify-center rounded-hatch border border-line-strong text-muted transition-colors hover:border-ink/40 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {theme === "dark" ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  );
}
