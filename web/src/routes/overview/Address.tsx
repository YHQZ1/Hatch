import type { ServiceRow } from "../services/service";
import CopyUrlButton from "./CopyUrlButton";
import { addressOf } from "./overview";

/**
 * The address a project is served at, under its name. A live one is a link
 * (its tooltip is the full URL) with a button that copies that full URL.
 */
export function Address({ row }: { row: ServiceRow }) {
  const address = addressOf(row);
  if (!address) return <p className="mt-0.5 truncate text-[13px] leading-5 text-faint">Not deployed yet</p>;
  if (!address.link) return <p className="mt-0.5 truncate text-[13px] leading-5 text-faint">{address.text}</p>;
  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1">
      <a
        href={address.link}
        target="_blank"
        rel="noopener noreferrer"
        title={address.link}
        className="pointer-events-auto min-w-0 truncate text-[13px] leading-5 text-muted transition-colors hover:text-ink"
      >
        {address.text}
      </a>
      <CopyUrlButton url={address.link} />
    </div>
  );
}
