import { Link } from "react-router";

/** The title bar every panel in the left column starts with, so they line up. */
export default function PanelHeader({
  title,
  link,
  aside,
}: {
  title: string;
  link?: { label: string; href: string };
  aside?: string;
}) {
  return (
    <div className="flex h-12 items-center justify-between border-b border-line px-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {link ? (
        <Link to={link.href} className="text-[13px] text-muted transition-colors hover:text-ink">
          {link.label}
        </Link>
      ) : (
        aside && <p className="text-[13px] text-muted">{aside}</p>
      )}
    </div>
  );
}
