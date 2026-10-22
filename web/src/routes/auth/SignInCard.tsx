import { useState } from "react";
import { siGithub } from "simple-icons";
import { Link, useSearchParams } from "react-router";
import BrandIcon from "@/components/BrandIcon";
import { logout } from "@/lib/api";
import { authErrorMessage } from "@/lib/authErrors";
import { useSignedInUser } from "@/lib/useSignedInUser";
import Button from "../landing/Button";

/** The sign-in form, or, for a visitor who already has a session, who they are. */
export default function SignInCard() {
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
      <h1 className="text-3xl font-semibold tracking-tight">Sign in to Hatch</h1>
      <p className="mt-3 leading-relaxed text-muted">
        Continue with your GitHub account. If you are new, signing in creates
        your account.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-7 rounded-hatch border border-danger/40 bg-danger/10 px-4 py-3 text-sm leading-relaxed text-danger"
        >
          {error}
        </div>
      )}

      <Button
        href="/auth/github"
        sameTab
        className="mt-7 h-12 w-full text-[1rem]"
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
        className="mt-7 inline-block text-sm text-muted transition-colors hover:text-ink"
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
      <h1 className="text-3xl font-semibold tracking-tight">You are signed in</h1>
      <p className="mt-3 leading-relaxed text-muted">
        Signed in as <span className="font-medium text-ink">@{username}</span>.
      </p>
      <Button to="/overview" className="mt-7 h-12 w-full text-[1rem]">
        Continue to your overview
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
