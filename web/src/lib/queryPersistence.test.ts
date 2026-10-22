import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPersistedQueryCache,
  persistQueryCache,
  restoreQueryCache,
} from "./queryPersistence";

/** Saves `seed` into one client, then restores it into a fresh one. */
function roundTrip(seed: (client: QueryClient) => void): QueryClient {
  const first = new QueryClient();
  const stop = persistQueryCache(first);
  seed(first);
  vi.advanceTimersByTime(1000);
  stop();

  const second = new QueryClient();
  restoreQueryCache(second);
  return second;
}

describe("query cache persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("brings back what was on screen, so a reload shows it at once", () => {
    const restored = roundTrip((client) => {
      client.setQueryData(["me"], { username: "octocat" });
      client.setQueryData(["projects"], [{ id: "p1" }]);
      client.setQueryData(["projects", "p1", "deployments"], [{ id: "d1" }]);
      client.setQueryData(["activity"], [{ id: "a1" }]);
      client.setQueryData(["github", "repos"], { installed: true });
    });

    expect(restored.getQueryData(["me"])).toEqual({ username: "octocat" });
    expect(restored.getQueryData(["projects"])).toEqual([{ id: "p1" }]);
    expect(restored.getQueryData(["projects", "p1", "deployments"])).toEqual([{ id: "d1" }]);
    expect(restored.getQueryData(["activity"])).toEqual([{ id: "a1" }]);
    expect(restored.getQueryData(["github", "repos"])).toEqual({ installed: true });
  });

  it("never stores environment variables or other queries", () => {
    const restored = roundTrip((client) => {
      client.setQueryData(["projects", "p1", "env-vars"], [{ key: "SECRET", value: "x" }]);
      client.setQueryData(["github", "dockerfile", "o/r", ""], { found: true });
      client.setQueryData(["something-else"], 1);
    });

    expect(restored.getQueryData(["projects", "p1", "env-vars"])).toBeUndefined();
    expect(restored.getQueryData(["github", "dockerfile", "o/r", ""])).toBeUndefined();
    expect(restored.getQueryData(["something-else"])).toBeUndefined();
    expect(sessionStorage.getItem("hatch_query_cache_v1") ?? "").not.toContain("SECRET");
  });

  it("restores nothing once it has been cleared, as on sign-out", () => {
    const first = new QueryClient();
    persistQueryCache(first);
    first.setQueryData(["me"], { username: "octocat" });
    vi.advanceTimersByTime(1000);

    clearPersistedQueryCache();
    const second = new QueryClient();
    restoreQueryCache(second);

    expect(second.getQueryData(["me"])).toBeUndefined();
  });

  it("ignores a saved cache that is too old", () => {
    const first = new QueryClient();
    persistQueryCache(first);
    first.setQueryData(["me"], { username: "octocat" });
    vi.advanceTimersByTime(1000);

    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    const second = new QueryClient();
    restoreQueryCache(second);

    expect(second.getQueryData(["me"])).toBeUndefined();
  });

  it("starts empty instead of failing on unreadable storage", () => {
    sessionStorage.setItem("hatch_query_cache_v1", "{not json");

    const client = new QueryClient();
    expect(() => restoreQueryCache(client)).not.toThrow();
    expect(client.getQueryData(["me"])).toBeUndefined();
  });
});
