import { useEffect } from "react";
import { Link } from "react-router";
import type { Session } from "@/lib/types";

/** How long the open hatch is shown before the overview opens, in milliseconds. */
const HANDOFF_MS = 2800;

const RINGS = [0, 1, 2];

/** A cube whose lid lifts open once the session is confirmed. */
export default function SuccessHatch({
  user,
  onDone,
}: {
  user: Session | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(onDone, HANDOFF_MS);
    return () => window.clearTimeout(timer);
  }, [user, onDone]);

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center">
      <div aria-hidden className="hx-stage flex h-[26rem] items-end justify-center pb-24">
        <div className="hx-cube" data-open={user ? "true" : "false"}>
          <div className="hx-face hx-back" />
          <div className="hx-face hx-left" />
          <div className="hx-face hx-right" />
          <div className="hx-face hx-bottom" />
          <div className="hx-inner" />
          {RINGS.map((i) => (
            <div key={i} className="hx-ring" style={{ "--i": i } as React.CSSProperties} />
          ))}
          <div className="hx-face hx-front" />
          <div className="hx-lid">
            <div className="hx-face" />
          </div>
        </div>
      </div>

      <h1 className="text-3xl font-semibold tracking-tight">
        {user ? (
          <>
            Signed in as <span className="text-accent">@{user.username}</span>
          </>
        ) : (
          "Signing you in"
        )}
      </h1>
      <p className="mt-3 h-6 text-muted">
        {user ? "Opening your overview." : "Confirming your GitHub session."}
      </p>
      <div className="mt-6 h-5 text-sm">
        {user ? (
          <Link to="/overview" className="text-muted transition-colors hover:text-ink">
            Continue now
          </Link>
        ) : (
          <Link to="/auth" className="text-faint transition-colors hover:text-ink">
            Taking too long? Back to sign in
          </Link>
        )}
      </div>
    </div>
  );
}
