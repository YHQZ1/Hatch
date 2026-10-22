import { Link } from "react-router";

const ACTION = "text-[13px] text-muted transition-colors hover:text-ink";

/** The title bar every panel in the left column starts with, so they line up. */
export default function PanelHeader({
  title,
  link,
  action,
  aside,
}: {
  title: string;
  /** A way to another page. */
  link?: { label: string; href: string };
  /** A button that changes the panel itself, such as showing more of it. */
  action?: { label: string; onClick: () => void; expanded?: boolean };
  aside?: string;
}) {
  return (
    <div className="flex h-12 items-center justify-between border-b border-line px-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {link ? (
        <Link to={link.href} className={ACTION}>
          {link.label}
        </Link>
      ) : action ? (
        <button type="button" onClick={action.onClick} aria-expanded={action.expanded} className={ACTION}>
          {action.label}
        </button>
      ) : (
        aside && <p className="text-[13px] text-muted">{aside}</p>
      )}
    </div>
  );
}
