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
const FLASH_NOTICE_KEY = "hatch_flash_notice";

export function apiUrl(path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }
  return `${baseUrl}${path}`;
}

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
  if (getCookie(CSRF_COOKIE_NAME)) return;

  await fetch(apiUrl("/api/csrf"), {
    method: "GET",
    credentials: "include",
  });
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const method = (init.method || "GET").toUpperCase();

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    await ensureCSRFToken();
    const csrfToken = getCookie(CSRF_COOKIE_NAME);
    if (csrfToken) {
      headers.set(CSRF_HEADER_NAME, csrfToken);
    }
  }

  return fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: "include",
  });
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
  } catch {}
  return fallback;
}

export function clearClientSession() {
  CACHE_KEYS.forEach((key) => localStorage.removeItem(key));

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

export function consumeFlashNotice(): {
  type: "success" | "error" | "info";
  title: string;
  message?: string;
} | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(FLASH_NOTICE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(FLASH_NOTICE_KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function logout() {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } finally {
    clearClientSession();
  }
}

export function redirectIfUnauthorized(
  res: Response,
  router: { push: (path: string) => void },
) {
  if (res.status !== 401) return false;
  clearClientSession();
  router.push("/auth");
  return true;
}

export function deploymentUrl(host?: string | null) {
  if (!host) return null;
  if (/^https?:\/\//.test(host)) {
    return host;
  }
  const scheme = process.env.NEXT_PUBLIC_DEPLOYMENT_URL_SCHEME || "https";
  return `${scheme}://${host.replace(/^https?:\/\//, "")}`;
}

export function websocketUrl(path: string) {
  const wsBaseUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (wsBaseUrl) {
    return `${wsBaseUrl}${path}`;
  }
  return apiUrl(path).replace(/^http/, "ws");
}
