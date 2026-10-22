import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { PageLoadingState } from "@/components/LoadingState";
import { NoticeToast, type NoticePayload } from "@/components/NoticeToast";
import { useNotice } from "@/components/useNotice";
import { AppShell, PageTitle } from "@/components/ui";
import { clearClientSession, logout } from "@/lib/api";
import { cn } from "@/lib/cn";
import { meQuery } from "@/lib/queries";
import AccountSection from "./settings/AccountSection";
import AwsSection from "./settings/AwsSection";
import BrowserSection from "./settings/BrowserSection";
import GitHubSection from "./settings/GitHubSection";
import GuardrailsSection from "./settings/GuardrailsSection";

const SECTIONS = [
  { id: "account", label: "Account" },
  { id: "github", label: "GitHub" },
  { id: "aws", label: "AWS" },
  { id: "guardrails", label: "Guardrails" },
  { id: "browser", label: "This browser" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const LOAD_FAILED_NOTICE: NoticePayload = {
  type: "error",
  title: "Settings unavailable",
  message: "Refresh the page once the server is back online.",
};

/** One page for the account and how Hatch connects to GitHub, in sections. */
export default function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const me = useQuery(meQuery());
  const { notice, setNotice, dismiss } = useNotice({
    failedAt: me.isError ? me.errorUpdatedAt : null,
    notice: LOAD_FAILED_NOTICE,
  });

  const requested = params.get("section");
  const section: SectionId =
    SECTIONS.find((item) => item.id === requested)?.id ?? "account";

  async function handleSignOut() {
    await logout();
    queryClient.clear();
    navigate("/");
  }

  function handleClearCache() {
    clearClientSession();
    void queryClient.resetQueries();
    setNotice({
      type: "success",
      title: "Cached data cleared",
      message: "Fresh data will load from the server.",
    });
  }

  if (me.isPending) return <PageLoadingState />;

  return (
    <AppShell>
      <NoticeToast notice={notice} onDismiss={dismiss} />
      <PageTitle
        title="Settings"
        description="Your account, and how Hatch connects to GitHub and AWS."
      />

      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Settings sections">
          <ul className="flex gap-6 overflow-x-auto border-b border-line text-sm lg:flex-col lg:gap-1 lg:overflow-visible lg:border-b-0">
            {SECTIONS.map((item) => {
              const active = item.id === section;
              return (
                <li key={item.id} className="shrink-0">
                  <Link
                    to={`/settings?section=${item.id}`}
                    replace
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative block py-3 transition-colors lg:rounded-hatch lg:px-3 lg:py-2",
                      active
                        ? "text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-accent lg:bg-ink/5 lg:after:hidden"
                        : "text-muted hover:text-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          {section === "account" && me.data && (
            <AccountSection user={me.data} onSignOut={handleSignOut} />
          )}
          {section === "github" && <GitHubSection />}
          {section === "aws" && <AwsSection />}
          {section === "guardrails" && <GuardrailsSection />}
          {section === "browser" && <BrowserSection onClear={handleClearCache} />}
        </div>
      </div>
    </AppShell>
  );
}
