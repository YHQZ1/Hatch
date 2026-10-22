import { cn } from "@/lib/cn";

/**
 * The title of a top-level page (Deployments, Cost, Resources, Settings): one
 * size everywhere, with an optional line saying what the page is for. Pages
 * for a single project use the larger PageTitle in ui.tsx instead.
 */
export default function PageHeading({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn(className)}>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
    </div>
  );
}
