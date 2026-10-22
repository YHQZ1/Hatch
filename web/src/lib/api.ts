import type { NavigateFunction } from "react-router";
import { clearPersistedQueryCache } from "./queryPersistence";
import { safeHttpUrl } from "./url";

// Earlier versions of the UI cached API data in localStorage under these
// names. Nothing writes them now; signing out still removes any leftovers.
const CACHE_PREFIXES = ["hatch_project_", "hatch_deployment_"];
const CACHE_KEYS = [
  "hatch_token",
  "hatch_projects_cache",
  "hatch_insights_cache",
  "hatch_activity_cache",
  "hatch_profile_cache",
];
const CSRF_COOKIE_NAME = "hatch_csrf";
const CSRF_HEADER_NAME = "X-CSRF-Token";
const CSRF_STORAGE_KEY = "hatch_csrf_token";
const FLASH_NOTICE_KEY = "hatch_flash_notice";

// The UI is served by the same Hatch server as the API (and by the Vite dev
// server's proxy in development), so every request stays on this origin.

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(
      `(?:^|; )${name.replace(/[$()*+.?[\\\\\\]^{|}]/g, "\\\\$&")}=([^;]*)`,
    ),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCSRFToken() {
  const cookieToken = getCookie(CSRF_COOKIE_NAME);
  if (cookieToken) return cookieToken;

  const storedToken =
    typeof sessionStorage === "undefined"
      ? null
      : sessionStorage.getItem(CSRF_STORAGE_KEY);
  if (storedToken) return storedToken;

  const res = await fetch("/api/csrf", {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) return null;

  try {
    const data = await res.json();
    const token =
      typeof data?.csrf_token === "string" ? data.csrf_token.trim() : "";
    if (token) {
      sessionStorage.setItem(CSRF_STORAGE_KEY, token);
      return token;
    }
  } catch {
    // The response was not JSON; fall back to the cookie.
  }

  return getCookie(CSRF_COOKIE_NAME);
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const method = (init.method || "GET").toUpperCase();
  const requiresCSRF = !["GET", "HEAD", "OPTIONS"].includes(method);

  if (requiresCSRF) {
    const csrfToken = await ensureCSRFToken();
    if (csrfToken) {
      headers.set(CSRF_HEADER_NAME, csrfToken);
    }
  }

  const request = {
    ...init,
    headers,
    credentials: "include",
  } satisfies RequestInit;

  const res = await fetch(path, request);
  if (requiresCSRF && res.status === 403) {
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
    const retryToken = await ensureCSRFToken();
    if (retryToken && retryToken !== headers.get(CSRF_HEADER_NAME)) {
      headers.set(CSRF_HEADER_NAME, retryToken);
      return fetch(path, request);
    }
  }

  return res;
}

/** A failed API response, with the server's message and the HTTP status. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Fetches JSON from the API; any non-2xx response throws an ApiError. */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    throw new ApiError(
      await readApiError(res, `Request failed (${res.status})`),
      res.status,
    );
  }
  return res.json() as Promise<T>;
}

export async function readApiError(
  res: Response,
  fallback = "Request failed",
) {
  try {
    const data = await res.json();
    if (typeof data?.error === "string" && data.error.trim()) {
      return data.error;
    }
  } catch {
    // Keep the fallback message.
  }
  return fallback;
}

export function clearClientSession() {
  clearPersistedQueryCache();
  CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
  sessionStorage.removeItem(CSRF_STORAGE_KEY);

  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (key && CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      localStorage.removeItem(key);
    }
  }
}

export function pushFlashNotice(notice: {
  type: "success" | "error" | "info";
  title: string;
  message?: string;
}) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(FLASH_NOTICE_KEY, JSON.stringify(notice));
}

export function peekFlashNotice(): {
  type: "success" | "error" | "info";
  title: string;
  message?: string;
} | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(FLASH_NOTICE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearFlashNotice() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(FLASH_NOTICE_KEY);
}

export async function logout() {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } finally {
    clearClientSession();
  }
}

export function redirectIfUnauthorized(res: Response, navigate: NavigateFunction) {
  if (res.status !== 401) return false;
  clearClientSession();
  navigate("/auth");
  return true;
}

export interface AppConfig {
  /** Domain deployed apps are served under, such as "apps.example.com". */
  baseDomain: string;
  /** How deployed apps are reached. */
  deploymentUrlScheme: "http" | "https";
}

let appConfig: AppConfig = { baseDomain: "", deploymentUrlScheme: "https" };

export function getAppConfig(): AppConfig {
  return appConfig;
}

/**
 * Loads the server's public settings once at startup so URL helpers can stay
 * synchronous. A failure keeps the defaults: pages still work, and deployed
 * app addresses fall back to https.
 */
export async function loadAppConfig(): Promise<void> {
  try {
    const res = await fetch("/api/config", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return;
    const data = await res.json();
    appConfig = {
      baseDomain:
        typeof data?.base_domain === "string" ? data.base_domain : "",
      deploymentUrlScheme:
        data?.deployment_url_scheme === "http" ? "http" : "https",
    };
  } catch {
    // Keep the defaults.
  }
}

export function deploymentUrl(host?: string | null) {
  if (!host) return null;
  return safeHttpUrl(
    /^https?:\/\//.test(host)
      ? host
      : `${appConfig.deploymentUrlScheme}://${host}`,
  );
}

/** The public host of a project: its subdomain under the base domain. */
export function productionHost(subdomain: string | null) {
  if (!subdomain) return null;
  if (subdomain.includes(".") || /^https?:\/\//.test(subdomain)) {
    return subdomain;
  }
  const { baseDomain } = appConfig;
  return baseDomain ? `${subdomain}.${baseDomain}` : subdomain;
}

export function websocketUrl(path: string) {
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.host}${path}`;
}
