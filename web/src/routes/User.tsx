import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { PageLoadingState } from "@/components/LoadingState";
import { clearClientSession, logout } from "@/lib/api";
import { NO_PROJECTS, meQuery, projectsQuery } from "@/lib/queries";

type Notice = {
  tone: "success" | "info" | "error";
  title: string;
  message?: string;
};

const LOAD_FAILED_NOTICE: Notice = {
  tone: "error",
  title: "Account failed to load",
  message: "Refresh the page once your API server is back online.",
};

export default function UserClient() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id: routeUsername = "" } = useParams();

  const meResult = useQuery(meQuery());
  const projectsResult = useQuery(projectsQuery());
  const user = meResult.data ?? null;
  const projects = projectsResult.data ?? NO_PROJECTS;
  const loading = meResult.isPending || projectsResult.isPending;
  const [actionNotice, setNotice] = useState<Notice | null>(null);
  const notice = actionNotice ?? (meResult.isError ? LOAD_FAILED_NOTICE : null);
  const [copied, setCopied] = useState<string | null>(null);

  // /u/<name> always shows the signed-in user's own page.
  useEffect(() => {
    if (user?.username && routeUsername && routeUsername !== user.username) {
      navigate(`/u/${user.username}`, { replace: true });
    }
  }, [user?.username, routeUsername, navigate]);

  const stats = useMemo(() => {
    const autoDeployCount = projects.filter((project) => project.auto_deploy).length;
    return {
      totalProjects: projects.length,
      autoDeployCount,
      manualProjects: Math.max(projects.length - autoDeployCount, 0),
    };
  }, [projects]);

  const avatarUrl = user
    ? `https://github.com/${encodeURIComponent(user.username)}.png`
    : "";
  const githubUrl = user ? `https://github.com/${user.username}` : "";

  async function handleSignOut() {
    await logout();
    queryClient.clear();
    navigate("/");
  }

  function handleReconnectGitHub() {
    window.location.href = "/auth/github";
  }

  function handleClearLocalCache() {
    clearClientSession();
    void queryClient.resetQueries();
    setNotice({
      tone: "success",
      title: "Local cache cleared",
      message: "Fresh project and account data will load on the next request.",
    });
  }

  async function copyValue(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
  }

  if (loading) return <PageLoadingState />;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-black text-white">
      <main className="mx-auto w-full max-w-[1180px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <header className="border-b border-[#171717] pb-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-600">
                User Settings
              </p>
              <h1 className="mt-3 text-[38px] font-semibold tracking-[-0.045em] text-white sm:text-[52px]">
                Account
              </h1>
              <p className="mt-3 max-w-2xl text-[14px] leading-6 text-zinc-500">
                Manage your GitHub identity, connection state, and local Hatch
                console session.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleReconnectGitHub}
                className="h-11 border border-[#262626] px-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white cursor-pointer"
              >
                Reconnect GitHub
              </button>
              <button
                onClick={handleSignOut}
                className="h-11 border border-[#3a2020] px-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#c56b6b] transition-colors hover:border-[#c56b6b] hover:text-[#e08a8a] cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {notice && (
          <div className="py-5">
            <div
              className={`border-l-2 px-4 py-3 ${
                notice.tone === "success"
                  ? "border-[#74c69d] bg-[#050c08] text-[#74c69d]"
                  : notice.tone === "error"
                    ? "border-[#c56b6b] bg-[#120808] text-[#c56b6b]"
                    : "border-zinc-500 bg-[#080808] text-zinc-300"
              }`}
            >
              <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.14em]">
                {notice.title}
              </p>
              {notice.message && (
                <p className="mt-1 text-[13px] leading-5 text-zinc-500">
                  {notice.message}
                </p>
              )}
            </div>
          </div>
        )}

        <section className="grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <div className="flex items-center gap-5 border-b border-[#171717] pb-8">
              {user && (
                <img
                  src={avatarUrl}
                  alt={user.username}
                  className="h-20 w-20 rounded-[4px] border border-[#242424]"
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-[28px] font-semibold tracking-[-0.04em] text-white">
                  {user?.username || "Account unavailable"}
                </p>
                {githubUrl ? (
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block truncate font-mono text-[13px] text-zinc-500 transition-colors hover:text-zinc-300 cursor-pointer"
                  >
                    {githubUrl}
                  </a>
                ) : (
                  <p className="mt-2 font-mono text-[13px] text-zinc-600">
                    GitHub profile unavailable
                  </p>
                )}
              </div>
            </div>

            <SettingsGroup
              eyebrow="Identity"
              title="Profile"
              description="Your Hatch account is backed by GitHub OAuth."
            >
              <DataRow label="Username" value={user?.username || "-"} />
              <DataRow label="Auth method" value="GitHub OAuth" />
              <DataRow
                label="GitHub profile"
                value={githubUrl || "-"}
                href={githubUrl || undefined}
              />
            </SettingsGroup>

            <SettingsGroup
              eyebrow="Identifiers"
              title="Account IDs"
              description="Use these when debugging account-specific API behavior."
            >
              <CopyRow
                label="User ID"
                value={user?.user_id || "-"}
                copied={copied === "user_id"}
                onCopy={() => user?.user_id && copyValue(user.user_id, "user_id")}
                disabled={!user?.user_id}
              />
              <CopyRow
                label="GitHub ID"
                value={user?.github_id ? String(user.github_id) : "-"}
                copied={copied === "github_id"}
                onCopy={() =>
                  user?.github_id &&
                  copyValue(String(user.github_id), "github_id")
                }
                disabled={!user?.github_id}
              />
            </SettingsGroup>

            <SettingsGroup
              eyebrow="Connection"
              title="GitHub access"
              description="Refresh the OAuth connection when repository permissions change."
            >
              <ActionRow
                title="GitHub"
                description={`Connected as @${user?.username || "unknown"}`}
                status="Connected"
                tone="success"
              >
                <button
                  onClick={handleReconnectGitHub}
                  className="h-10 border border-[#2a2a2a] px-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white cursor-pointer"
                >
                  Reconnect
                </button>
              </ActionRow>
            </SettingsGroup>

            <SettingsGroup
              eyebrow="Session"
              title="Browser data"
              description="Clear local console data without deleting projects or cloud infrastructure."
            >
              <ActionRow
                title="Local cache"
                description="Clears cached account, project, deployment, activity, and insights data."
              >
                <button
                  onClick={handleClearLocalCache}
                  className="h-10 border border-[#3a2d18] px-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#b8872f] transition-colors hover:border-[#b8872f] hover:text-[#d6a34a] cursor-pointer"
                >
                  Clear cache
                </button>
              </ActionRow>
            </SettingsGroup>
          </div>

          <aside className="h-fit border-y border-[#171717] py-6 lg:sticky lg:top-24">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-700">
              Workspace
            </p>
            <div className="mt-5 space-y-5">
              <SummaryLine label="Services" value={String(stats.totalProjects)} />
              <SummaryLine
                label="Auto-deploy enabled"
                value={String(stats.autoDeployCount)}
              />
              <SummaryLine
                label="Manual deploy services"
                value={String(stats.manualProjects)}
              />
            </div>
            <div className="mt-8 border-t border-[#171717] pt-6">
              <p className="text-[13px] leading-6 text-zinc-500">
                Account deletion is intentionally not exposed here yet. Project
                deletion lives in each project settings page where the affected
                service is explicit.
              </p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

function SettingsGroup({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-5 border-b border-[#171717] py-8 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-700">
          {eyebrow}
        </p>
        <h2 className="mt-3 text-[21px] font-semibold tracking-[-0.03em] text-white">
          {title}
        </h2>
        <p className="mt-2 max-w-xs text-[13px] leading-6 text-zinc-500">
          {description}
        </p>
      </div>
      <div className="min-w-0 border-t border-[#171717] lg:border-t-0">
        {children}
      </div>
    </section>
  );
}

function DataRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="grid gap-2 border-b border-[#111] py-4 sm:grid-cols-[170px_minmax(0,1fr)] sm:items-center">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-600">
        {label}
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 truncate font-mono text-[13px] text-zinc-300 transition-colors hover:text-white cursor-pointer"
        >
          {value}
        </a>
      ) : (
        <p className="min-w-0 truncate font-mono text-[13px] text-zinc-300">
          {value}
        </p>
      )}
    </div>
  );
}

function ActionRow({
  title,
  description,
  status,
  tone,
  children,
}: {
  title: string;
  description: string;
  status?: string;
  tone?: "success";
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-[#111] py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          {status && (
            <span
              className={`h-2 w-2 rounded-full ${
                tone === "success" ? "bg-[#74c69d]" : "bg-zinc-600"
              }`}
            />
          )}
          <p className="text-[15px] font-medium text-white">{title}</p>
          {status && (
            <p
              className={`font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${
                tone === "success" ? "text-[#74c69d]" : "text-zinc-500"
              }`}
            >
              {status}
            </p>
          )}
        </div>
        <p className="mt-2 max-w-xl text-[13px] leading-5 text-zinc-500">
          {description}
        </p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-600">
        {label}
      </p>
      <p className="font-mono text-[22px] font-semibold tracking-[-0.03em] text-white">
        {value}
      </p>
    </div>
  );
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
  disabled,
}: {
  label: string;
  value: string;
  copied?: boolean;
  onCopy: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[#111] py-4 sm:flex-row sm:items-center">
      <p className="w-36 flex-shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-600">
        {label}
      </p>
      <p className="min-w-0 flex-1 truncate font-mono text-[13px] text-zinc-300">
        {value}
      </p>
      <button
        onClick={onCopy}
        disabled={disabled}
        className="h-9 border border-[#262626] px-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 enabled:cursor-pointer"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
