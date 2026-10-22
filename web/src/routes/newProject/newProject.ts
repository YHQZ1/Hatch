import type { GitHubRepo } from "@/lib/types";

export interface EnvVar {
  key: string;
  value: string;
}

export interface ParsedRepo {
  owner: string;
  repo: string;
  fullName: string;
  url: string;
}

/**
 * Reads a repository from what people paste: a github.com address (with or
 * without a path after the repository, `.git` or `www.`), an SSH address, or
 * plain `owner/repo`. Anything else is not a repository.
 */
export function parseGitHubRepo(value: string): ParsedRepo | null {
  const raw = value.trim();
  if (!raw) return null;

  let path = raw.replace(/^git@github\.com:/, "");
  if (path === raw && raw.includes("://")) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (!/^https?:$/.test(url.protocol)) return null;
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
    path = url.pathname;
  } else if (/^(www\.)?github\.com\//.test(path)) {
    path = path.replace(/^(www\.)?github\.com\//, "");
  }

  const [owner, name] = path.split(/[?#]/)[0].split("/").filter(Boolean);
  const repo = name?.replace(/\.git$/, "");
  if (!owner || !repo) return null;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  return { owner, repo, fullName: `${owner}/${repo}`, url: `https://github.com/${owner}/${repo}` };
}

/** A repository known only by its address, shaped like one from the GitHub App. */
export function repoFromAddress(parsed: ParsedRepo): GitHubRepo {
  return {
    id: -Date.now(),
    name: parsed.repo,
    full_name: parsed.fullName,
    private: false,
    html_url: parsed.url,
    description: "",
    language: "",
    updated_at: new Date().toISOString(),
  };
}

/** A project's address is a DNS label: lower case, letters, digits and hyphens. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

export const isValidSubdomain = (value: string) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value);

/** What the address field accepts while typing: a trailing hyphen stays so "my-app" can be typed. */
export function cleanSubdomain(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 40);
}

export const sanitizePath = (path: string) =>
  path.replace(/^\.\//, "").replace(/\/+$/, "").replace(/\/+/g, "/").trim();

export const dockerfilePathIn = (folder: string) => {
  const clean = sanitizePath(folder);
  return clean ? `${clean}/Dockerfile` : "Dockerfile";
};

export const defaultPortFor = (language?: string) =>
  language === "Go" ? "8080" : language === "Python" ? "8000" : "80";

/** Reads KEY=value lines (comments and blanks skipped, quotes removed) from a .env file. */
export function parseEnvText(text: string): EnvVar[] {
  const parsed: EnvVar[] = [];
  for (const line of text.split("\n")) {
    const clean = line.split("#")[0].trim();
    const eq = clean.indexOf("=");
    if (eq < 0) continue;
    const key = clean.slice(0, eq).trim().toUpperCase().replace(/\s+/g, "_");
    let value = clean.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (key) parsed.push({ key, value });
  }
  return parsed;
}

/** Adds incoming variables to the list, replacing the value of any key already there. */
export function mergeEnv(existing: EnvVar[], incoming: EnvVar[]): EnvVar[] {
  const merged = existing.filter((item) => item.key.trim() || item.value);
  for (const next of incoming) {
    const at = merged.findIndex((item) => item.key === next.key);
    if (at >= 0) merged[at] = next;
    else merged.push(next);
  }
  return merged;
}

/**
 * What pasting does in the name box of row `index`: when the text is KEY=value
 * lines (and the box is empty, or several lines were pasted), they become rows
 * and the empty row they were pasted into is dropped. Null means paste as
 * ordinary text. Only names do this: a value may well contain "=".
 */
export function pasteIntoEnv(vars: EnvVar[], index: number, text: string): EnvVar[] | null {
  if (!text.includes("=")) return null;
  if (vars[index]?.key && !text.includes("\n")) return null;
  const parsed = parseEnvText(text);
  if (parsed.length === 0) return null;
  return mergeEnv(vars, parsed);
}

/** The variables worth sending: those with a name. */
export function envMap(vars: EnvVar[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const { key, value } of vars) if (key.trim()) map[key.trim()] = value;
  return map;
}

/** The first thing wrong with the form, or null when it can be deployed. */
export function firstProblem(form: {
  name: string;
  subdomain: string;
  port: string;
  branch: string;
  hasDockerfile: boolean | null;
  /** Why the server will not give this address, once it has said so. */
  addressError?: string | null;
}): string | null {
  if (!form.name.trim()) return "Give the project a name.";
  if (!form.subdomain) return "Choose an address for the project.";
  if (!isValidSubdomain(form.subdomain)) {
    return "The address can use letters, digits and hyphens, and cannot start or end with a hyphen.";
  }
  if (form.addressError) return form.addressError;
  const port = Number(form.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return "The port must be between 1 and 65535.";
  if (!form.branch.trim()) return "Choose a branch.";
  if (form.hasDockerfile === false) return "No Dockerfile in that folder.";
  return null;
}
