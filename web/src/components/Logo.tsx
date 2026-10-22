import { cn } from "@/lib/cn";
// The logo file itself, so replacing public/hatch.svg replaces the logo everywhere.
import logoSvg from "../../public/hatch.svg?raw";

/**
 * Hatch's logo, drawn inline from public/hatch.svg so that its colours can
 * follow the theme (an <img> cannot). The file's two colours are mapped to the
 * theme's own colours in styles.css (`.hatch-logo`): its white lines become the
 * text colour and its lavender glow becomes the accent, so the light theme gets
 * dark lines and the light theme's purple, exactly as the rest of the page does.
 *
 * Give it a size with a class (`h-6 w-6`). It is decorative: the name is next to
 * it wherever it is used.
 */
export default function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("hatch-logo inline-block shrink-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full", className)}
      // Our own file, bundled at build time; nothing from a user or the network.
      dangerouslySetInnerHTML={{ __html: logoSvg }}
    />
  );
}
