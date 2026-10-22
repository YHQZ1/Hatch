import { siGithub } from "simple-icons";
import BrandIcon from "@/components/BrandIcon";
import { Button } from "@/components/ui";

/**
 * The bar across the top of the page: paste a repository's address and import
 * it. Enter submits; a problem with the address is shown under the bar.
 */
export default function UrlBar({
  value,
  error,
  onChange,
  onSubmit,
}: {
  value: string;
  error: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex gap-3">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">GitHub repository address</span>
          <BrandIcon
            icon={siGithub}
            color="currentColor"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
          />
          <input
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Paste a GitHub address, or type owner/repo"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-invalid={error !== ""}
            aria-describedby="repo-address-note"
            className="h-11 w-full rounded-hatch border border-line-strong bg-base pl-10 pr-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none aria-[invalid=true]:border-danger"
          />
        </label>
        <Button type="submit" variant="primary" className="h-11 shrink-0 px-5">
          Import
        </Button>
      </div>
      {error ? (
        <p id="repo-address-note" role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : (
        <p id="repo-address-note" className="mt-2 text-xs text-faint">
          Works with github.com/owner/repo, owner/repo and git@github.com addresses.
        </p>
      )}
    </form>
  );
}
