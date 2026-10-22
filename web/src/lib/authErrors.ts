/**
 * Explains the `?error=` code the server puts on /auth when sign-in fails
 * (see docs/07-github-app-setup.md). "session" is raised by the web app itself
 * when sign-in finished but the browser did not keep the session.
 */
const MESSAGES: Record<string, string> = {
  state:
    "That sign-in link expired or was opened in a different browser. Please try again.",
  denied: "Sign-in was cancelled on GitHub. Nothing was changed.",
  exchange: "GitHub did not complete the sign-in. Please try again in a moment.",
  github: "GitHub did not complete the sign-in. Please try again in a moment.",
  session:
    "You signed in, but this browser did not keep the session. Check that cookies are allowed for this site, then try again.",
  server: "Something went wrong on our side. Please try again.",
};

/** The message for an error code, or null when there is no error. */
export function authErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? MESSAGES.server;
}
