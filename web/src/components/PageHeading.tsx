import { cn } from "@/lib/cn";

/**
 * The title of a page (Deployments, Cost, Resources, Settings, New project):
 * one size everywhere, with an optional line saying what the page is for. The
 * pages of a single project and deployment put an icon beside a title of the
 * same size.
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
