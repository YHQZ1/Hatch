import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { NO_INSTALLATIONS, NO_REPOS, githubReposQuery } from "@/lib/queries";
import type { GitHubInstallation, GitHubRepo } from "@/lib/types";
import { ExternalLink, SectionLayout, SettingRow, SettingsCard } from "./primitives";

/** Where GitHub lets the user change which repositories one installation covers. */
function manageUrl(installation: GitHubInstallation): string {
  const id = encodeURIComponent(String(installation.id));
  return installation.type === "Organization"
    ? `https://github.com/organizations/${encodeURIComponent(installation.account)}/settings/installations/${id}`
    : `https://github.com/settings/installations/${id}`;
}

function repoCount(repos: GitHubRepo[], account: string): number {
  const prefix = `${account.toLowerCase()}/`;
  return repos.filter((repo) => repo.full_name.toLowerCase().startsWith(prefix)).length;
}

function pluralize(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The Hatch GitHub App: where it is installed, what it can reach, how to revoke it. */
export default function GitHubSection() {
  const result = useQuery(githubReposQuery());
  const installations = result.data?.installations ?? NO_INSTALLATIONS;
  const repos = result.data?.repos ?? NO_REPOS;
  const installed = result.data?.installed === true;

  return (
    <SectionLayout
      main={
        <SettingsCard
          title="Hatch GitHub App"
          description="Hatch reads your code through a GitHub App you install on the accounts and repositories you choose."
        >
          {result.isPending ? (
            <div className="space-y-3 px-5 py-5" aria-hidden>
              <div className="h-4 w-1/3 animate-pulse rounded-hatch bg-line" />
              <div className="h-4 w-1/2 animate-pulse rounded-hatch bg-line/60" />
            </div>
          ) : result.isError ? (
            <p className="px-5 py-5 text-sm text-danger">
              We couldn&apos;t reach GitHub just now. Try again in a moment.
            </p>
          ) : !installed ? (
            <SettingRow
              label="Not installed"
              description="Install the App to give Hatch read access to the repositories you want to deploy."
            >
              <Button href="/auth/install" variant="primary" className="h-9">
                Install on GitHub
              </Button>
            </SettingRow>
          ) : (
            installations.map((installation) => (
              <div
                key={installation.id}
                className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <img
                    src={`https://github.com/${encodeURIComponent(installation.account)}.png?size=64`}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-hatch border border-line"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{installation.account}</p>
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
                      {installation.type === "Organization" ? "Organization" : "Personal"}
                      {" · "}
                      {pluralize(repoCount(repos, installation.account), "repository", "repositories")}
                    </p>
                  </div>
                </div>
                <ExternalLink href={manageUrl(installation)} className="shrink-0">
                  Manage
                </ExternalLink>
              </div>
            ))
          )}

          <div
            className={cn(
              "flex flex-wrap items-center gap-3 border-t border-line px-5 py-4",
              !result.isPending && !installed && "hidden",
            )}
          >
            <Button href="/auth/install" className="h-9">
              Install on another account
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                window.location.href = "/auth/github";
              }}
              className="h-9"
            >
              Reconnect GitHub
            </Button>
          </div>
        </SettingsCard>
      }
      aside={
        <>
        <SettingsCard
          title="What Hatch can access"
          description="The App asks for the least it needs to build your code."
        >
          <SettingRow label="Repository contents" description="Read-only, and only on repositories you grant. Hatch cannot push, edit or delete anything." />
          <SettingRow label="Repository metadata" description="Names, branches and visibility, so you can pick what to deploy." />
          <SettingRow label="Builds" description="A build gets a one-hour token limited to the single repository it is cloning. Hatch never hands your own GitHub token to a build." />
        </SettingsCard>

        <SettingsCard title="Revoke access">
          <SettingRow
            label="Remove Hatch from GitHub"
            stacked
            description="Uninstalling the App or revoking its authorization on GitHub takes effect immediately. Your running projects are not touched, but new deploys will fail."
          >
            <ExternalLink href="https://github.com/settings/apps/authorized">
              Authorized GitHub Apps
            </ExternalLink>
          </SettingRow>
        </SettingsCard>
        </>
      }
    />
  );
}
