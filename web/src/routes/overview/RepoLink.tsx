import { siGithub } from "simple-icons";
import BrandIcon from "@/components/BrandIcon";
import { cn } from "@/lib/cn";
import { safeHttpUrl } from "@/lib/url";

/**
 * A repository as `username/reponame` with the GitHub mark, linking to it on
 * GitHub. It sits on top of the row's own link, so it takes pointer events
 * itself.
 */
export function RepoLink({ url, slug, className }: { url: string; slug: string; className?: string }) {
  const href = safeHttpUrl(url);
  const label = (
    <>
      <BrandIcon icon={siGithub} color="currentColor" className="h-4 w-4 shrink-0" />
      <span className="truncate">{slug}</span>
    </>
  );
  const base = "inline-flex min-w-0 items-center gap-2";
  if (!href) return <span className={cn(base, className)}>{label}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(base, "pointer-events-auto transition-colors hover:text-ink", className)}
    >
      {label}
    </a>
  );
}
