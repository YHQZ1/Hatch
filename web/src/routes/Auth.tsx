import { useState } from "react";
import { siGithub } from "simple-icons";
import { Link, useSearchParams } from "react-router";
import BrandIcon from "@/components/BrandIcon";
import ThemeToggle from "@/components/ThemeToggle";
import { logout } from "@/lib/api";
import { authErrorMessage } from "@/lib/authErrors";
import { useTheme } from "@/lib/theme";
import { useSignedInUser } from "@/lib/useSignedInUser";
import Backdrop from "./landing/Backdrop";
import Badge, { type Status } from "./landing/Badge";
import Button from "./landing/Button";
import Container from "./landing/Container";
import Frame from "./landing/Frame";

const NEXT_STEPS: { title: string; body: string; status: Status }[] = [
  {
    title: "Choose your repositories",
    body: "Install the Hatch GitHub App on the repositories Hatch may read. Access is read-only.",
    status: "development",
  },
  {
    title: "Connect your AWS account",
    body: "One click to grant Hatch a scoped role. No access keys to copy or store.",
    status: "planned",
  },
  {
    title: "Deploy",
    body: "Review the cost estimate, then deploy a Dockerfile and watch the build.",
    status: "development",
  },
];

export default function AuthPage() {
  const { theme, toggle } = useTheme();

  return (
    <div
      data-theme={theme}
      style={{ colorScheme: theme }}
      className="flex min-h-screen w-full flex-col bg-base text-ink"
    >
      <header className="border-b border-line">
        <Container className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/hatch.svg" alt="" className="theme-logo h-6 w-6" />
            <span className="text-lg font-semibold tracking-tight">Hatch</span>
          </Link>
          <ThemeToggle theme={theme} onToggle={toggle} />
        </Container>
      </header>

      <main className="grid flex-1 lg:grid-cols-2">
        <section className="relative flex items-center overflow-hidden">
          <Backdrop />
          <div className="relative w-full px-6 py-16 md:px-10 lg:px-16 lg:py-24">
            <div className="animate-rise mx-auto w-full max-w-md">
              <SignInCard />
            </div>
          </div>
        </section>

        <aside className="border-t border-line bg-panel lg:border-l lg:border-t-0">
          <div className="px-6 py-16 md:px-10 lg:px-16 lg:py-24">
            <div className="mx-auto w-full max-w-md">
              <h2 className="text-xl font-semibold tracking-tight">
                What happens next
              </h2>
              <p className="mt-2 leading-relaxed text-muted">
                Signing in is the first of three steps. Here is the rest of the
                way to a running service.
              </p>
              <Frame className="mt-8">
                <ol className="divide-y divide-line rounded-hatch border border-line bg-base">
                  {NEXT_STEPS.map((step, i) => (
                    <li key={step.title} className="flex gap-4 p-5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-hatch border border-line-strong text-sm text-muted">
                        {i + 1}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <h3 className="font-medium">{step.title}</h3>
                          <Badge status={step.status} />
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted">
                          {step.body}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Frame>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function SignInCard() {
  const user = useSignedInUser();
  const [params] = useSearchParams();
  const error = authErrorMessage(params.get("error"));

  if (user.status === "checking") {
    return <div className="h-72" aria-hidden />;
  }
  if (user.status === "signed-in") {
    return <SignedIn username={user.user.username} onSignedOut={user.refresh} />;
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
        Sign in to Hatch
      </h1>
      <p className="mt-3 leading-relaxed text-muted">
        Continue with your GitHub account. If you are new, signing in creates
        your account.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-8 rounded-hatch border border-danger/40 bg-danger/10 px-4 py-3 text-sm leading-relaxed text-danger"
        >
          {error}
        </div>
      )}

      <Button
        href="/auth/github"
        sameTab
        className="mt-8 h-12 w-full text-base"
        icon={<BrandIcon icon={siGithub} color="currentColor" className="h-5 w-5" />}
      >
        Continue with GitHub
      </Button>

      <p className="mt-6 text-sm leading-relaxed text-muted">
        Hatch learns your GitHub username and nothing else about you. It can
        read a repository only after you install the Hatch App on it, and then
        only to read.
      </p>
      <Link
        to="/"
        className="mt-8 inline-block text-sm text-muted transition-colors hover:text-ink"
      >
        Back to home
      </Link>
    </div>
  );
}

function SignedIn({
  username,
  onSignedOut,
}: {
  username: string;
  onSignedOut: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
        You are signed in
      </h1>
      <p className="mt-3 leading-relaxed text-muted">
        Signed in as <span className="font-medium text-ink">@{username}</span>.
      </p>
      <Button to="/console" className="mt-8 h-12 w-full text-base">
        Continue to the console
      </Button>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await logout();
          onSignedOut();
        }}
        className="mt-6 text-sm text-muted transition-colors hover:text-ink disabled:opacity-50"
      >
        Not you? Sign out
      </button>
    </div>
  );
}
