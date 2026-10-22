import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui";
import {
  apiFetch,
  getAppConfig,
  productionHost,
  pushFlashNotice,
  readApiError,
  redirectIfUnauthorized,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { activityQuery, projectsQuery } from "@/lib/queries";
import type { GitHubRepo } from "@/lib/types";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import type { NoticePayload } from "@/components/NoticeToast";
import { safeHttpUrl } from "@/lib/url";
import { CheckIcon, CloseIcon, LockIcon, RepoIcon } from "../overview/Glyphs";
import EnvEditor from "./EnvEditor";
import Field from "./Field";
import { addressReason, subdomainQuery } from "./subdomainQuery";
import { dockerfileQuery } from "./dockerfileQuery";
import {
  cleanSubdomain,
  defaultPortFor,
  dockerfilePathIn,
  envMap,
  firstProblem,
  isValidSubdomain,
  sanitizePath,
  slugify,
  type EnvVar,
} from "./newProject";

const NO_PORTS: number[] = [];

/**
 * Everything a first deployment needs, for one chosen repository: the project's
 * name and address, how to build and run it, and its variables. A summary
 * beside the form (below it on a phone) holds the deploy button. The caller
 * gives this a `key` per repository, so changing repository starts afresh.
 */
export default function Configure({
  repo,
  seenByApp,
  onChange,
  onNotice,
}: {
  repo: GitHubRepo;
  /** Whether the GitHub App can see the repository; null while that is not known. */
  seenByApp: boolean | null;
  onChange: () => void;
  onNotice: (notice: NoticePayload) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deploying, setDeploying] = useState(false);

  const [name, setName] = useState(repo.name);
  // null until the address is edited; then it no longer follows the name.
  const [addressInput, setAddressInput] = useState<string | null>(null);
  const [branch, setBranch] = useState(repo.default_branch || "main");
  // null until the port is edited; then it wins over what the Dockerfile says.
  const [portInput, setPortInput] = useState<string | null>(null);
  const [healthCheck, setHealthCheck] = useState("/health");
  const [folder, setFolder] = useState("./");
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);

  // Looks again once the folder has stopped changing.
  const checkedFolder = sanitizePath(useDebouncedValue(folder, 600));
  const dockerfile = useQuery(dockerfileQuery(repo.full_name, checkedFolder));
  const checking = dockerfile.isFetching;
  const hasDockerfile = dockerfile.data ? dockerfile.data.found : dockerfile.isError ? false : null;
  const detectedPorts = dockerfile.data?.ports ?? NO_PORTS;

  const port = portInput ?? (detectedPorts.length > 0 ? String(detectedPorts[0]) : defaultPortFor(repo.language));
  const subdomain = addressInput ?? slugify(name);
  const baseDomain = getAppConfig().baseDomain;

  // Ask the server once the address has stopped changing. Its answer counts
  // only while it is about the address on screen.
  const checkedAddress = useDebouncedValue(subdomain, 500);
  const availability = useQuery(subdomainQuery(isValidSubdomain(checkedAddress) ? checkedAddress : ""));
  const settled = checkedAddress === subdomain && availability.data !== undefined;
  const addressError = settled && !availability.data?.available ? addressReason(availability.data?.reason) : null;
  const addressChecking = isValidSubdomain(subdomain) && !settled && !availability.isError;

  const problem = firstProblem({ name, subdomain, port, branch, hasDockerfile, addressError });
  const portValue = Number(port);
  const portOk = Number.isInteger(portValue) && portValue >= 1 && portValue <= 65535;
  const named = envVars.filter((item) => item.key.trim()).length;

  const deploy = async () => {
    if (problem || deploying) return;
    setDeploying(true);
    const env = envMap(envVars);
    const portNumber = parseInt(port, 10);

    try {
      const projectRes = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_name: name.trim() || repo.name,
          repo_url: repo.html_url,
          subdomain,
          branch,
          dockerfile_path: dockerfilePathIn(folder),
          port: portNumber,
          health_check: healthCheck,
          env_vars: env,
        }),
      });
      if (redirectIfUnauthorized(projectRes, navigate)) return;
      if (!projectRes.ok) {
        onNotice({
          type: "error",
          title: "Project creation failed",
          message: await readApiError(projectRes, "We couldn't create the project."),
        });
        setDeploying(false);
        return;
      }

      const project = await projectRes.json();
      void queryClient.invalidateQueries({ queryKey: projectsQuery().queryKey });
      void queryClient.invalidateQueries({ queryKey: activityQuery().queryKey });
      const deployRes = await apiFetch("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          env_vars: env,
        }),
      });
      if (redirectIfUnauthorized(deployRes, navigate)) return;
      if (deployRes.ok) {
        pushFlashNotice({
          type: "success",
          title: "Project created",
          message: "The first deployment has been queued.",
        });
      } else {
        pushFlashNotice({
          type: "error",
          title: "Deployment failed to start",
          message: await readApiError(
            deployRes,
            "The project was created, but the first deployment could not be queued.",
          ),
        });
      }
      navigate(`/projects/${project.id}`);
    } catch {
      onNotice({
        type: "error",
        title: "Request failed",
        message: "We couldn't reach the API to create the project.",
      });
      setDeploying(false);
    }
  };

  const repoUrl = safeHttpUrl(repo.html_url);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void deploy();
      }}
      className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14"
    >
      <div className="min-w-0 space-y-10">
        <div>
          <label htmlFor="project-name" className="text-sm text-muted">
            Project name
          </label>
          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="my-project"
            autoComplete="off"
            spellCheck={false}
            className="mt-1 block w-full border-b border-line bg-transparent pb-2 text-3xl font-semibold tracking-tight text-ink transition-colors placeholder:text-faint hover:border-line-strong focus:border-accent focus:outline-none"
          />

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-muted">Served at</span>
            <span className="-mx-1.5 inline-flex min-w-0 items-center rounded-hatch border border-line px-1.5 py-0.5 transition-colors focus-within:border-accent hover:border-line-strong">
              <input
                aria-label="Address"
                value={subdomain}
                onChange={(event) => setAddressInput(cleanSubdomain(event.target.value))}
                placeholder="my-project"
                autoComplete="off"
                spellCheck={false}
                className="field-sizing-content min-w-[6ch] max-w-full bg-transparent font-medium text-ink placeholder:text-faint focus:outline-none"
              />
              {baseDomain && <span className="text-muted">.{baseDomain}</span>}
            </span>
            <AddressStatus
              subdomain={subdomain}
              error={addressError}
              checking={addressChecking}
              available={settled && !addressError}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <RepoIcon className="h-4 w-4 shrink-0 text-muted" />
            {repoUrl ? (
              <a href={repoUrl} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {repo.full_name}
              </a>
            ) : (
              <span className="font-medium">{repo.full_name}</span>
            )}
            {repo.private && <LockIcon className="h-3.5 w-3.5 shrink-0 text-faint" />}
            <DockerfileStatus found={hasDockerfile} checking={checking} folder={checkedFolder} />
            <button
              type="button"
              onClick={onChange}
              className="cursor-pointer text-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
            >
              Change
            </button>
          </div>

          {seenByApp === false && (
            <p className="mt-4 text-sm leading-relaxed text-warning">
              Hatch reads repositories through its GitHub App, and the App can&apos;t see this one yet.{" "}
              <a href="/auth/install" className="underline underline-offset-2">
                Add it to the App
              </a>{" "}
              before you deploy.
            </p>
          )}
        </div>

        <Section title="Build" description="Hatch builds the Dockerfile on this branch.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Branch" value={branch} onChange={setBranch} placeholder="main" />
            <Field
              label="Dockerfile folder"
              value={folder}
              onChange={setFolder}
              placeholder="./"
              hint="Relative to the repository root."
            />
          </div>
        </Section>

        <Section title="Run" description="How Hatch starts the container and knows it is up.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Port"
              value={port}
              onChange={(value) => setPortInput(value.replace(/[^0-9]/g, ""))}
              placeholder="8080"
              hint={
                detectedPorts.length > 0 && portInput === null
                  ? `From the Dockerfile, which exposes ${detectedPorts.join(", ")}.`
                  : "The port your app listens on in the container."
              }
            />
            <Field
              label="Health check path"
              value={healthCheck}
              onChange={setHealthCheck}
              placeholder="/health"
              hint="Must answer before a deployment is called live."
            />
          </div>
        </Section>

        <Section title="Environment variables" description="Passed to the container when it starts.">
          <EnvEditor vars={envVars} onChange={setEnvVars} />
        </Section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start lg:border-l lg:border-line lg:pl-10">
        <h2 className="text-[1rem] font-semibold tracking-tight">Deploy</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          <Check label="Name" ok={name.trim() !== ""} value={name.trim() || "Required"} />
          <Check
            label="Address"
            ok={addressError || !isValidSubdomain(subdomain) ? false : addressChecking ? null : true}
            value={
              addressError
                ? availability.data?.reason === "subdomain already in use"
                  ? "Taken"
                  : availability.data?.reason === "subdomain is reserved"
                    ? "Reserved"
                    : "Unavailable"
                : subdomain
                  ? (productionHost(subdomain) ?? subdomain)
                  : "Required"
            }
          />
          <Check
            label="Dockerfile"
            ok={checking ? null : hasDockerfile}
            value={checking || hasDockerfile === null ? "Checking…" : hasDockerfile ? "Found" : "Not found"}
          />
          <Check label="Branch" ok={branch.trim() !== ""} value={branch.trim() || "Required"} />
          <Check label="Port" ok={portOk} value={port || "Required"} />
          <Check label="Variables" ok={null} value={named === 0 ? "None" : String(named)} />
        </ul>
        <Button type="submit" variant="primary" className="mt-5 h-10 w-full" disabled={deploying || problem !== null}>
          {deploying ? "Deploying…" : "Deploy project"}
        </Button>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          {problem ?? "Hatch clones the branch, builds the image, starts it, and waits for the health check."}
        </p>
      </aside>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-t border-line pt-8 md:grid-cols-[200px_minmax(0,1fr)]">
      <div>
        <h2 className="text-[1rem] font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/**
 * One line of the deploy checklist. `ok` is true with a tick, false with a
 * cross and the value in red, and null (still checking, or nothing to check)
 * with neither.
 */
function Check({ label, ok, value }: { label: string; ok: boolean | null; value: string }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {ok === true && <CheckIcon className="h-4 w-4 text-success" />}
        {ok === false && <CloseIcon className="h-3.5 w-3.5 text-danger" />}
      </span>
      <span className="text-muted">{label}</span>
      <span
        title={value}
        className={cn("ml-auto min-w-0 truncate text-right font-medium", ok === false && "text-danger", ok === null && "text-muted")}
      >
        {value}
      </span>
    </li>
  );
}

/** What the server and the format say about the address, beside it. */
function AddressStatus({
  subdomain,
  error,
  checking,
  available,
}: {
  subdomain: string;
  error: string | null;
  checking: boolean;
  available: boolean;
}) {
  if (error) return <span className="text-danger">{error}</span>;
  if (subdomain && !isValidSubdomain(subdomain)) {
    return <span className="text-danger">Use letters and digits, with hyphens between.</span>;
  }
  if (checking) return <span className="animate-pulse text-faint">Checking…</span>;
  if (available) {
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <CheckIcon className="h-3.5 w-3.5" />
        Available
      </span>
    );
  }
  return null;
}

/** Whether a Dockerfile was found, in words, beside the repository's name. */
function DockerfileStatus({
  found,
  checking,
  folder,
}: {
  found: boolean | null;
  checking: boolean;
  folder: string;
}) {
  if (checking || found === null) return <span className="animate-pulse text-faint">Looking for a Dockerfile…</span>;
  if (found) {
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <CheckIcon className="h-3.5 w-3.5" />
        Dockerfile found
      </span>
    );
  }
  return (
    <span className="text-danger">
      No Dockerfile in {folder ? `${folder}/` : "the repository root"}. Change the folder below.
    </span>
  );
}
