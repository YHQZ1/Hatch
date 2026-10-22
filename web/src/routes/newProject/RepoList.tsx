import { useMemo, useState } from "react";
import SelectField from "@/components/SelectField";
import { Button } from "@/components/ui";
import type { GitHubInstallation, GitHubRepo } from "@/lib/types";
import { LockIcon, RepoIcon } from "../overview/Glyphs";
import Toolbar from "../overview/Toolbar";
import { useSearchShortcut } from "../overview/useSearchShortcut";
import { formatRelativeTime } from "../services/service";

/** How many repositories show at first, and how many each "Show more" adds. */
const PAGE = 8;
const ALL_ACCOUNTS = "all";

const ownerOf = (repo: GitHubRepo) => repo.full_name.split("/")[0];

/**
 * The repositories the Hatch GitHub App can see, newest activity first. With
 * more than one account connected they can be narrowed to one; the search
 * matches the name and the description.
 */
export default function RepoList({
  loading,
  installed,
  installations,
  repos,
  onPick,
}: {
  loading: boolean;
  installed: boolean;
  installations: GitHubInstallation[];
  repos: GitHubRepo[];
  onPick: (repo: GitHubRepo) => void;
}) {
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState(ALL_ACCOUNTS);
  const [shown, setShown] = useState(PAGE);
  const searchRef = useSearchShortcut();

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return repos
      .filter((repo) => account === ALL_ACCOUNTS || ownerOf(repo) === account)
      .filter(
        (repo) =>
          !needle || repo.full_name.toLowerCase().includes(needle) || repo.description?.toLowerCase().includes(needle),
      )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [repos, query, account]);

  if (loading) return <ListSkeleton />;
  if (!installed) {
    return (
      <Empty
        title="Connect your repositories"
        text="Install the Hatch App on GitHub and choose which repositories it can read. It never gets write access."
        action="Install the Hatch App"
      />
    );
  }
  if (repos.length === 0) {
    return (
      <Empty
        title="The Hatch App can't see any repositories yet"
        text="Choose the repositories it should have access to, then come back here."
        action="Choose repositories"
      />
    );
  }

  const reset = () => setShown(PAGE);

  return (
    <div className="space-y-4">
      <Toolbar
        query={query}
        onQuery={(value) => {
          setQuery(value);
          reset();
        }}
        searchRef={searchRef}
        placeholder="Search your repositories…"
        leading={
          installations.length > 1 ? (
            <SelectField
              label="Show repositories of"
              value={account}
              onChange={(value) => {
                setAccount(value);
                reset();
              }}
              className="w-36 sm:w-48"
              options={[
                { value: ALL_ACCOUNTS, label: "All accounts" },
                ...installations.map((item) => ({ value: item.account, label: item.account })),
              ]}
            />
          ) : undefined
        }
      />

      {matching.length === 0 ? (
        <div className="rounded-hatch border border-dashed border-line-strong px-6 py-10">
          <p className="text-lg font-semibold tracking-tight">No repositories match</p>
          <p className="mt-1 text-sm text-muted">Try a different word or account.</p>
        </div>
      ) : (
        <ul className="rounded-hatch border border-line-strong bg-base">
          {matching.slice(0, shown).map((repo) => (
            <li key={repo.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => onPick(repo)}
                className="group flex w-full cursor-pointer items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-ink/[0.03] focus-visible:bg-ink/[0.03] focus-visible:outline-none"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-hatch border border-line-strong text-muted">
                  <RepoIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm">
                      <span className="text-muted">{ownerOf(repo)}/</span>
                      <span className="font-medium text-ink">{repo.name}</span>
                    </span>
                    {repo.private && (
                      <>
                        <LockIcon className="h-3.5 w-3.5 shrink-0 text-faint" />
                        <span className="sr-only">Private</span>
                      </>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-faint">
                    {[repo.language, `Updated ${formatRelativeTime(repo.updated_at)}`, repo.description]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 rounded-hatch border border-line-strong px-3 py-1.5 text-sm font-medium text-ink transition-colors group-hover:border-ink/40 group-hover:bg-ink/5">
                  Import
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col items-center gap-2 pt-1">
        {matching.length > shown && (
          <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
            Show more
          </Button>
        )}
        <p className="text-xs text-faint">
          {Math.min(shown, matching.length)} of {matching.length} repositories ·{" "}
          <a href="/auth/install" className="underline-offset-2 hover:text-ink hover:underline">
            Change what Hatch can access
          </a>
        </p>
      </div>
    </div>
  );
}

function Empty({ title, text, action }: { title: string; text: string; action: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-hatch border border-dashed border-line-strong px-6 py-10">
      <p className="text-lg font-semibold tracking-tight">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-muted">{text}</p>
      <a
        href="/auth/install"
        className="inline-flex h-10 items-center rounded-hatch bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
      >
        {action}
      </a>
    </div>
  );
}

/** Holds the list's space while the repositories load. */
function ListSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      <div className="h-10 animate-pulse rounded-hatch bg-line" />
      <ul className="rounded-hatch border border-line-strong bg-base">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex h-[65px] items-center gap-4 border-b border-line px-4 last:border-b-0">
            <div className="h-9 w-9 animate-pulse rounded-hatch bg-line" />
            <div className="w-1/3 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded-hatch bg-line" />
              <div className="h-3 w-1/2 animate-pulse rounded-hatch bg-line/60" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
