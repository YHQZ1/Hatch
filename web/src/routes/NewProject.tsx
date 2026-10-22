import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { NoticeToast, type NoticePayload } from "@/components/NoticeToast";
import PageHeading from "@/components/PageHeading";
import { AppShell } from "@/components/ui";
import { useNotice } from "@/components/useNotice";
import { NO_INSTALLATIONS, NO_REPOS, githubReposQuery } from "@/lib/queries";
import type { GitHubRepo } from "@/lib/types";
import Configure from "./newProject/Configure";
import RepoList from "./newProject/RepoList";
import UrlBar from "./newProject/UrlBar";
import { parseGitHubRepo, repoFromAddress } from "./newProject/newProject";

const GITHUB_UNAVAILABLE_NOTICE: NoticePayload = {
  type: "error",
  title: "GitHub unavailable",
  message: "We couldn't load your repositories right now.",
};

/**
 * Where a project starts: pick a repository, by pasting its address or from the
 * ones the Hatch GitHub App can see, then confirm how to build and run it.
 */
export default function NewProjectPage() {
  const [repo, setRepo] = useState<GitHubRepo | null>(null);
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState("");

  const repos = useQuery(githubReposQuery());
  const { notice, setNotice, dismiss } = useNotice({
    failedAt: repos.isError ? repos.errorUpdatedAt : null,
    notice: GITHUB_UNAVAILABLE_NOTICE,
  });
  const available = repos.data?.repos ?? NO_REPOS;

  const importAddress = () => {
    const parsed = parseGitHubRepo(address);
    if (!parsed) {
      setAddressError("That doesn't look like a GitHub repository. Try github.com/owner/repo.");
      return;
    }
    // An address that matches a repository the App can see is that repository.
    const known = available.find((item) => item.full_name.toLowerCase() === parsed.fullName.toLowerCase());
    setAddressError("");
    setRepo(known ?? repoFromAddress(parsed));
  };

  const seenByApp = repo === null || repos.isPending ? null : available.some((item) => item.id === repo.id);

  return (
    <AppShell contentClassName="py-8">
      <div className="space-y-6">
        <PageHeading
          title="New project"
          description={
            repo ? "Check the settings, then deploy." : "Import a repository. Hatch builds its Dockerfile and runs it."
          }
        />

        {repo ? (
          <Configure
            key={repo.full_name}
            repo={repo}
            seenByApp={seenByApp}
            onChange={() => setRepo(null)}
            onNotice={setNotice}
          />
        ) : (
          <div className="space-y-8">
            <UrlBar
              value={address}
              error={addressError}
              onChange={(value) => {
                setAddress(value);
                setAddressError("");
              }}
              onSubmit={importAddress}
            />

            <div className="flex items-center gap-4" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              <span className="text-xs text-faint">or choose from your GitHub account</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <RepoList
              loading={repos.isPending}
              installed={repos.data?.installed === true}
              installations={repos.data?.installations ?? NO_INSTALLATIONS}
              repos={available}
              onPick={setRepo}
            />
          </div>
        )}
      </div>

      <NoticeToast notice={notice} onDismiss={dismiss} />
    </AppShell>
  );
}
