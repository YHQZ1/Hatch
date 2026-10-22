import { useEffect } from "react";
import { useLocation, useMatches } from "react-router";

const DEFAULT_TITLE = "Hatch — Deploys in your own AWS account";

/**
 * The document title for the current route: the deepest route's `handle.title`
 * plus the product name. The result is also saved for public/theme-init.js,
 * which restores it on the next reload before the app has loaded.
 */
export function useRouteTitle(): string {
  const matches = useMatches();
  const { pathname } = useLocation();
  const routeTitle = matches
    .map((match) => (match.handle as { title?: string } | undefined)?.title)
    .findLast(Boolean);
  const title = routeTitle ? `${routeTitle} | Hatch` : DEFAULT_TITLE;

  useEffect(() => {
    try {
      localStorage.setItem("hatch-last-title", JSON.stringify({ path: pathname, title }));
    } catch {
      // Without storage the title just updates once the app has loaded.
    }
  }, [pathname, title]);

  return title;
}
