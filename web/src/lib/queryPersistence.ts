import { type QueryClient, dehydrate, hydrate } from "@tanstack/react-query";

/**
 * Keeps the last-seen data in this tab's session storage, so a reload shows it
 * at once and refreshes it in the background, instead of building the page up
 * in stages as each request returns. Session storage ends with the tab, and
 * signing out clears it.
 *
 * Bump the version whenever the shape of a persisted response changes.
 */
const STORAGE_KEY = "hatch_query_cache_v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 300;

type QueryKey = readonly unknown[];

/** What is worth showing before the server has answered. Env vars never are. */
function isPersistable(queryKey: QueryKey): boolean {
  const [root, second, third] = queryKey;
  if (root === "github") return second === "repos";
  if (root === "projects") return third !== "env-vars";
  return root === "me" || root === "activity" || root === "deployments";
}

export function restoreQueryCache(client: QueryClient) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { savedAt: number; state: Parameters<typeof hydrate>[1] };
    if (Date.now() - saved.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    hydrate(client, saved.state);
  } catch {
    // Unreadable or unavailable storage just means a normal first load.
    clearPersistedQueryCache();
  }
}

/** Saves the cache whenever it changes; returns a function that stops saving. */
export function persistQueryCache(client: QueryClient): () => void {
  let timer: number | undefined;
  const save = () => {
    try {
      const state = dehydrate(client, {
        shouldDehydrateQuery: (query) =>
          query.state.status === "success" && isPersistable(query.queryKey),
      });
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), state }));
    } catch {
      // Storage can be full or blocked; the page works without it.
    }
  };
  const unsubscribe = client.getQueryCache().subscribe(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(save, SAVE_DELAY_MS);
  });
  return () => {
    window.clearTimeout(timer);
    unsubscribe();
  };
}

export function clearPersistedQueryCache() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
