import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  apiFetch,
  deploymentUrl,
  getAppConfig,
  loadAppConfig,
  productionHost,
  readApiError,
  redirectIfUnauthorized,
} from "./api";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
  document.cookie = "hatch_csrf=; max-age=0";
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

test("deployed app URLs use the configured domain and scheme", async () => {
  fetchMock.mockResolvedValueOnce(
    jsonResponse({ base_domain: "apps.example.com", deployment_url_scheme: "http" }),
  );
  await loadAppConfig();

  expect(productionHost("my-app")).toBe("my-app.apps.example.com");
  expect(deploymentUrl("my-app.apps.example.com")).toBe(
    "http://my-app.apps.example.com",
  );
});

test("the server says whether pushes can deploy anything, and the default is no", async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ base_domain: "x.dev", webhooks: true }));
  await loadAppConfig();
  expect(getAppConfig().webhooks).toBe(true);

  // Anything but an explicit true counts as not set up.
  for (const webhooks of [false, "true", 1, null, undefined]) {
    fetchMock.mockResolvedValueOnce(jsonResponse({ base_domain: "x.dev", webhooks }));
    await loadAppConfig();
    expect(getAppConfig().webhooks, String(webhooks)).toBe(false);
  }
});

test("hosts that are already complete are left alone", () => {
  expect(productionHost("my-app.other.dev")).toBe("my-app.other.dev");
  expect(deploymentUrl("https://my-app.other.dev")).toBe("https://my-app.other.dev");
  expect(deploymentUrl(null)).toBeNull();
  expect(productionHost(null)).toBeNull();
});

test("a host that is not a web address does not become a link", () => {
  expect(deploymentUrl("javascript:alert(1)")).toBeNull();
});

test("a failed config request keeps the previous settings", async () => {
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  await expect(loadAppConfig()).resolves.toBeUndefined();
});

test("reads need no CSRF token", async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({}));
  await apiFetch("/api/projects");

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const init = fetchMock.mock.calls[0][1]!;
  expect(new Headers(init.headers).has("X-CSRF-Token")).toBe(false);
  expect(init.credentials).toBe("include");
});

test("writes fetch a CSRF token first and send it", async () => {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ csrf_token: "tok-1" }))
    .mockResolvedValueOnce(jsonResponse({}));
  await apiFetch("/api/projects", { method: "POST" });

  expect(fetchMock.mock.calls[0][0]).toBe("/api/csrf");
  const init = fetchMock.mock.calls[1][1]!;
  expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("tok-1");
});

test("writes use the CSRF cookie when present", async () => {
  document.cookie = "hatch_csrf=from-cookie";
  fetchMock.mockResolvedValueOnce(jsonResponse({}));
  await apiFetch("/api/projects", { method: "DELETE" });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const init = fetchMock.mock.calls[0][1]!;
  expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("from-cookie");
});

test("a 403 on a write refreshes the token and retries once", async () => {
  sessionStorage.setItem("hatch_csrf_token", "stale");
  fetchMock
    .mockResolvedValueOnce(jsonResponse({}, 403))
    .mockResolvedValueOnce(jsonResponse({ csrf_token: "fresh" }))
    .mockResolvedValueOnce(jsonResponse({ ok: true }));
  const res = await apiFetch("/api/projects", { method: "POST" });

  expect(res.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  const retry = fetchMock.mock.calls[2][1]!;
  expect(new Headers(retry.headers).get("X-CSRF-Token")).toBe("fresh");
});

test("readApiError returns the server's message or the fallback", async () => {
  expect(await readApiError(jsonResponse({ error: "name taken" }, 409))).toBe("name taken");
  expect(await readApiError(new Response("oops", { status: 500 }), "Try again")).toBe(
    "Try again",
  );
});

test("a 401 clears the session and sends the user to /auth", () => {
  sessionStorage.setItem("hatch_csrf_token", "t");
  const navigate = vi.fn();

  expect(redirectIfUnauthorized(new Response(null, { status: 401 }), navigate)).toBe(true);
  expect(navigate).toHaveBeenCalledWith("/auth");
  expect(sessionStorage.getItem("hatch_csrf_token")).toBeNull();

  expect(redirectIfUnauthorized(new Response(null, { status: 200 }), navigate)).toBe(false);
});
