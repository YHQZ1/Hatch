import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { NoticeToast, type NoticePayload } from "@/components/NoticeToast";
import {
  AppShell,
  Button,
  Modal,
  PageTitle,
  StatusText,
} from "@/components/ui";
import { useNotice } from "@/components/useNotice";
import {
  ApiError,
  apiFetch,
  apiJson,
  getAppConfig,
  productionHost,
  pushFlashNotice,
  readApiError,
  redirectIfUnauthorized,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { activityQuery, projectsQuery } from "@/lib/queries";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

interface Repo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string;
  language: string;
  updated_at: string;
  default_branch?: string;
}

interface EnvVar {
  key: string;
  value: string;
}

const NO_REPOS: Repo[] = [];
const NO_PORTS: number[] = [];

const GITHUB_UNAVAILABLE_NOTICE: NoticePayload = {
  type: "error",
  title: "GitHub unavailable",
  message: "We couldn't load your repositories right now.",
};

const reposQuery = () =>
  queryOptions({
    queryKey: ["github", "repos"],
    queryFn: async () => {
      const repos = await apiJson<Repo[] | null>("/api/github/repos");
      return Array.isArray(repos) ? repos : NO_REPOS;
    },
  });

/**
 * Whether the repository has a Dockerfile in the folder, and the ports it
 * exposes. Any answer other than 200 means no Dockerfile.
 */
const dockerfileQuery = (repoFullName: string | undefined, folder: string) =>
  queryOptions({
    queryKey: ["github", "dockerfile", repoFullName, folder],
    enabled: Boolean(repoFullName),
    retry: false,
    queryFn: async () => {
      const dockerfilePath = folder ? `${folder}/Dockerfile` : "Dockerfile";
      const response = await apiFetch(
        `/api/github/repos/${repoFullName}/dockerfile?path=${encodeURIComponent(dockerfilePath)}`,
      );
      if (response.status === 401) throw new ApiError("Unauthorized", 401);
      if (response.status !== 200) return { found: false, ports: NO_PORTS };

      const data = await response.json();
      const ports: number[] = Array.isArray(data.ports)
        ? data.ports.filter(
            (value: unknown) =>
              typeof value === "number" && Number.isInteger(value),
          )
        : NO_PORTS;
      return { found: true, ports };
    },
  });

const sanitizePath = (path: string) =>
  path.replace(/^\.\//, "").replace(/\/+$/, "").replace(/\/+/g, "/").trim();

const defaultPortFor = (language?: string) =>
  language === "Go" ? "8080" : language === "Python" ? "8000" : "80";

export default function NewProjectClient() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [search, setSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [sourceMode, setSourceMode] = useState<"connected" | "url">("connected");
  const [manualRepoUrl, setManualRepoUrl] = useState("");
  const [manualRepoError, setManualRepoError] = useState("");
  const [deploying, setDeploying] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [branch, setBranch] = useState("main");
  // null until the user edits the port; then their value wins over detection.
  const [portInput, setPortInput] = useState<string | null>(null);
  const [healthCheck, setHealthCheck] = useState("/health");
  const [rootPath, setRootPath] = useState("./");
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkEnv, setBulkEnv] = useState("");

  const reposResult = useQuery(reposQuery());
  const repos = reposResult.data ?? NO_REPOS;
  const loading = reposResult.isPending;
  const { notice, setNotice, dismiss } = useNotice({
    failedAt: reposResult.isError ? reposResult.errorUpdatedAt : null,
    notice: GITHUB_UNAVAILABLE_NOTICE,
  });

  // Re-check the Dockerfile once the folder has stopped changing.
  const checkedFolder = sanitizePath(useDebouncedValue(rootPath, 600));
  const dockerfileCheck = useQuery(
    dockerfileQuery(selectedRepo?.full_name, checkedFolder),
  );
  const checkingDocker = dockerfileCheck.isFetching;
  const hasDockerfile = dockerfileCheck.data
    ? dockerfileCheck.data.found
    : dockerfileCheck.isError
      ? false
      : null;
  const detectedPorts = dockerfileCheck.data?.ports ?? NO_PORTS;
  const port =
    portInput ??
    (detectedPorts.length > 0
      ? String(detectedPorts[0])
      : defaultPortFor(selectedRepo?.language));

  const handleSelectRepo = (repo: Repo) => {
    setSelectedRepo(repo);
    setManualRepoError("");
    setProjectName(repo.name);
    setBranch(repo.default_branch || "main");
    setSubdomain("");
    setPortInput(null);
    setStep(2);
  };

  const handleManualRepoContinue = () => {
    const parsed = parseGitHubRepoUrl(manualRepoUrl);
    if (!parsed) {
      setManualRepoError("Enter a valid GitHub repository URL.");
      return;
    }

    const repo: Repo = {
      id: -Date.now(),
      name: parsed.repo,
      full_name: parsed.fullName,
      private: false,
      html_url: parsed.url,
      description: "",
      language: "",
      updated_at: new Date().toISOString(),
      default_branch: branch || "main",
    };

    setSourceMode("url");
    setSelectedRepo(repo);
    setManualRepoUrl(parsed.url);
    setManualRepoError("");
    setProjectName(parsed.repo);
    setBranch(branch || "main");
    setSubdomain("");
    setPortInput(null);
    setStep(2);
  };

  const validationErrors = useMemo(() => {
    const errors = [];
    if (!selectedRepo) errors.push("Repository required");
    if (!projectName.trim()) errors.push("Project name required");
    if (!subdomain.trim()) errors.push("Subdomain required");
    if (!port.trim() || Number.isNaN(parseInt(port, 10))) {
      errors.push("Valid port required");
    }
    if (hasDockerfile === false) errors.push("Dockerfile missing");
    return errors;
  }, [selectedRepo, projectName, subdomain, port, hasDockerfile]);

  const handleDeploy = async () => {
    if (validationErrors.length > 0) return;
    setDeploying(true);
    const envVarsMap: Record<string, string> = {};
    envVars.forEach(({ key, value }) => {
      if (key.trim()) envVarsMap[key.trim()] = value;
    });
    const cleanRoot = sanitizePath(rootPath);
    const finalDockerPath = cleanRoot
      ? `${cleanRoot}/Dockerfile`
      : "Dockerfile";

    try {
      const projectRes = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_name: projectName || selectedRepo?.name,
          repo_url: selectedRepo?.html_url,
          subdomain,
          branch,
          dockerfile_path: finalDockerPath,
          port: parseInt(port, 10),
          env_vars: envVarsMap,
        }),
      });
      if (redirectIfUnauthorized(projectRes, navigate)) return;
      if (!projectRes.ok) {
        setNotice({
          type: "error",
          title: "Project creation failed",
          message: await readApiError(
            projectRes,
            "We couldn't create the service record.",
          ),
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
          branch,
          port: parseInt(port, 10),
          health_check: healthCheck,
          env_vars: envVarsMap,
        }),
      });
      if (redirectIfUnauthorized(deployRes, navigate)) return;
      if (deployRes.ok) {
        pushFlashNotice({
          type: "success",
          title: "Service created",
          message: "The first deployment has been queued.",
        });
        navigate(`/projects/${project.id}`);
      } else {
        pushFlashNotice({
          type: "error",
          title: "Deployment failed to start",
          message: await readApiError(
            deployRes,
            "The service was created, but the first deployment could not be queued.",
          ),
        });
        navigate(`/projects/${project.id}`);
        setDeploying(false);
      }
    } catch {
      setNotice({
        type: "error",
        title: "Request failed",
        message: "We couldn't reach the API to create the service.",
      });
      setDeploying(false);
    }
  };

  const parseBulkEnv = (text: string) => {
    const parsed: EnvVar[] = [];
    text.split("\n").forEach((line) => {
      const clean = line.split("#")[0].trim();
      if (!clean || !clean.includes("=")) return;
      const eq = clean.indexOf("=");
      const key = clean.substring(0, eq).trim();
      let value = clean.substring(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key) {
        parsed.push({
          key: key.toUpperCase().replace(/\s+/g, "_"),
          value,
        });
      }
    });
    if (parsed.length > 0) setEnvVars(parsed);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      setBulkEnv(readerEvent.target?.result as string);
    };
    reader.readAsText(file);
  };

  const filteredRepos = repos.filter((repo) =>
    repo.full_name.toLowerCase().includes(search.toLowerCase()),
  );
  const hasSource = step === 2 && Boolean(selectedRepo);
  const buildStatusLabel = checkingDocker
    ? "Scanning"
    : hasDockerfile === true
      ? "Verified"
      : hasDockerfile === false
        ? "Missing"
        : "Pending";
  const repoSourceLabel =
    sourceMode === "url" ? "External repository" : "Connected repository";
  const configuredEnvVars = envVars.filter((item) => item.key.trim()).length;
  const dockerfileDirectory = rootPath || "./";
  const baseDomain = getAppConfig().baseDomain;
  const productionUrl = subdomain
    ? (productionHost(subdomain) ?? subdomain)
    : "Not set";
  const preflight = [
    { label: "Repository", ready: Boolean(selectedRepo) },
    { label: "Service name", ready: Boolean(projectName.trim()) },
    { label: "Subdomain", ready: Boolean(subdomain.trim()) },
    { label: "Port", ready: Boolean(port.trim()) },
    { label: "Dockerfile", ready: hasDockerfile === true },
  ];

  return (
    <AppShell>
      <NoticeToast notice={notice} onDismiss={dismiss} />
      <PageTitle
        eyebrow="New Service"
        title="Deploy from GitHub"
        description="Import a repository, confirm the runtime contract, and queue the first production deployment."
        actions={
          <Button variant="ghost" onClick={() => navigate("/console")}>
            Back to Console
          </Button>
        }
      />

      <main className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="min-w-0 space-y-8">
          <SetupSection
            index="01"
            title="Source"
            description="Choose a connected repository or paste a GitHub URL."
            action={
              hasSource ? (
                <button
                  onClick={() => {
                    setStep(1);
                    setSelectedRepo(null);
                    setProjectName("");
                    setManualRepoError("");
                  }}
                  className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:text-white cursor-pointer"
                >
                  Change source
                </button>
              ) : null
            }
          >
            {hasSource ? (
              <SelectedSource
                repo={selectedRepo}
                repoSourceLabel={repoSourceLabel}
                buildStatusLabel={buildStatusLabel}
                hasDockerfile={hasDockerfile}
                checkingDocker={checkingDocker}
              />
            ) : (
              <SourcePicker
                sourceMode={sourceMode}
                setSourceMode={setSourceMode}
                loading={loading}
                search={search}
                setSearch={setSearch}
                repos={filteredRepos}
                manualRepoUrl={manualRepoUrl}
                setManualRepoUrl={setManualRepoUrl}
                manualRepoError={manualRepoError}
                setManualRepoError={setManualRepoError}
                onSelectRepo={handleSelectRepo}
                onManualContinue={handleManualRepoContinue}
              />
            )}
          </SetupSection>

          {hasSource && (
            <>
              <SetupSection
                index="02"
                title="Identity"
                description="Name the service and reserve its production URL."
              >
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <FieldInput
                    label="Service name"
                    value={projectName}
                    onChange={setProjectName}
                    placeholder="my-api"
                  />
                  <div className="space-y-2.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                      Production URL
                    </label>
                    <div className="flex items-center border-b border-white/[0.11] transition-colors focus-within:border-white/35">
                      <input
                        value={subdomain}
                        onChange={(event) =>
                          setSubdomain(
                            event.target.value
                              .toLowerCase()
                              .replace(/\s+/g, "-"),
                          )
                        }
                        placeholder="my-service"
                        className="min-w-0 flex-1 bg-transparent py-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-800"
                      />
                      {baseDomain && (
                        <span className="shrink-0 pl-2 font-mono text-[11px] text-zinc-700">
                          .{baseDomain}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </SetupSection>

              <SetupSection
                index="03"
                title="Runtime"
                description="Hatch inspects the Dockerfile and uses these values for the first deployment."
              >
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <FieldInput
                    label="Port"
                    value={port}
                    onChange={(value) =>
                      setPortInput(value.replace(/[^0-9]/g, ""))
                    }
                    placeholder="8080"
                  />
                  <FieldInput
                    label="Health check"
                    value={healthCheck}
                    onChange={setHealthCheck}
                    placeholder="/health"
                  />
                </div>
                <p className="mt-4 text-sm leading-6 text-zinc-600">
                  {detectedPorts.length > 0
                    ? `Detected exposed port${detectedPorts.length > 1 ? "s" : ""}: ${detectedPorts.join(", ")}.`
                    : checkingDocker
                      ? "Scanning the Dockerfile for exposed ports."
                      : "If no port is detected, Hatch uses the value you provide here."}
                </p>
              </SetupSection>

              <SetupSection
                index="04"
                title="Build"
                description="Point Hatch at the folder containing your Dockerfile."
              >
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <FieldInput
                    label="Dockerfile directory"
                    value={rootPath}
                    onChange={setRootPath}
                    placeholder="./"
                  />
                  <FieldInput
                    label="Production branch"
                    value={branch}
                    onChange={setBranch}
                    placeholder="main"
                  />
                </div>
              </SetupSection>

              <SetupSection
                index="05"
                title="Environment"
                description="Add variables now or leave them empty and manage them later in settings."
                action={
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setIsBulkModalOpen(true)}
                      className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:text-white cursor-pointer"
                    >
                      Import .env
                    </button>
                    <button
                      onClick={() =>
                        setEnvVars([...envVars, { key: "", value: "" }])
                      }
                      className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:text-white cursor-pointer"
                    >
                      Add variable
                    </button>
                  </div>
                }
              >
                {envVars.length === 0 ? (
                  <p className="py-3 text-sm text-zinc-700">
                    No environment variables defined.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {envVars.map((envVar, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4"
                      >
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <FieldInput
                            label="Key"
                            value={envVar.key}
                            onChange={(value) => {
                              const next = [...envVars];
                              next[index].key = value
                                .toUpperCase()
                                .replace(/\s+/g, "_");
                              setEnvVars(next);
                            }}
                            placeholder="VARIABLE_NAME"
                          />
                          <FieldInput
                            label="Value"
                            value={envVar.value}
                            onChange={(value) => {
                              const next = [...envVars];
                              next[index].value = value;
                              setEnvVars(next);
                            }}
                            placeholder="value"
                          />
                        </div>
                        <button
                          onClick={() =>
                            setEnvVars(envVars.filter((_, item) => item !== index))
                          }
                          className="mb-3 h-8 w-8 rounded-md text-zinc-700 transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer"
                          aria-label="Remove environment variable"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </SetupSection>
            </>
          )}
        </div>

        <aside className="min-w-0 xl:sticky xl:top-8 xl:self-start">
          <DeploymentPreview
            hasSource={hasSource}
            projectName={projectName}
            selectedRepo={selectedRepo}
            repoSourceLabel={repoSourceLabel}
            productionUrl={productionUrl}
            port={port}
            branch={branch}
            dockerfileDirectory={dockerfileDirectory}
            buildStatusLabel={buildStatusLabel}
            hasDockerfile={hasDockerfile}
            checkingDocker={checkingDocker}
            envVarCount={configuredEnvVars}
            validationErrors={validationErrors}
            preflight={preflight}
            deploying={deploying}
            onDeploy={handleDeploy}
          />
        </aside>
      </main>

      <Modal
        open={isBulkModalOpen}
        title="Import environment variables"
        description="Paste .env content or upload a text file."
        onClose={() => setIsBulkModalOpen(false)}
      >
        <div className="space-y-5">
          <div className="relative">
            <input
              type="file"
              accept=".env,text/plain"
              onChange={handleFileUpload}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            />
            <div className="rounded-lg border border-dashed border-white/[0.13] px-4 py-5 text-center transition-colors hover:border-white/30">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                Click to upload .env
              </p>
            </div>
          </div>
          <textarea
            autoFocus
            value={bulkEnv}
            onChange={(event) => setBulkEnv(event.target.value)}
            placeholder={"PORT=8080\nDB_URL=postgresql://...\nNODE_ENV=production"}
            className="h-56 w-full resize-none rounded-lg border border-white/[0.1] bg-black p-4 font-mono text-sm leading-6 text-zinc-300 outline-none transition-colors placeholder:text-zinc-800 focus:border-white/30"
          />
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setBulkEnv("")}>
              Clear
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setIsBulkModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  parseBulkEnv(bulkEnv);
                  setIsBulkModalOpen(false);
                  setBulkEnv("");
                }}
              >
                Import
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}

function SourcePicker({
  sourceMode,
  setSourceMode,
  loading,
  search,
  setSearch,
  repos,
  manualRepoUrl,
  setManualRepoUrl,
  manualRepoError,
  setManualRepoError,
  onSelectRepo,
  onManualContinue,
}: {
  sourceMode: "connected" | "url";
  setSourceMode: (mode: "connected" | "url") => void;
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
  repos: Repo[];
  manualRepoUrl: string;
  setManualRepoUrl: (value: string) => void;
  manualRepoError: string;
  setManualRepoError: (value: string) => void;
  onSelectRepo: (repo: Repo) => void;
  onManualContinue: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-md border border-white/[0.1] p-1">
        <SourceTab
          active={sourceMode === "connected"}
          onClick={() => setSourceMode("connected")}
        >
          Connected GitHub
        </SourceTab>
        <SourceTab active={sourceMode === "url"} onClick={() => setSourceMode("url")}>
          Repository URL
        </SourceTab>
      </div>

      {sourceMode === "connected" ? (
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Search repositories..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-11 w-full rounded-lg border border-white/[0.1] bg-transparent px-3.5 text-sm text-zinc-200 outline-none transition-colors placeholder:text-zinc-800 focus:border-white/30"
          />
          <div className="max-h-[560px] overflow-y-auto border-y border-white/[0.08]">
            {loading ? (
              <ListMessage text="Fetching repositories..." />
            ) : repos.length === 0 ? (
              <ListMessage text="No repositories found" />
            ) : (
              repos.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => onSelectRepo(repo)}
                  className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-white/[0.055] py-4 text-left transition-colors last:border-b-0 hover:bg-white/[0.025] cursor-pointer"
                >
                  <div className="min-w-0 px-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-800 transition-colors group-hover:bg-zinc-500" />
                      <p className="truncate text-sm font-medium text-zinc-300 transition-colors group-hover:text-white">
                        {repo.full_name}
                      </p>
                      {repo.private && (
                        <span className="shrink-0 rounded border border-white/[0.1] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                          private
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate pl-3.5 text-xs text-zinc-700">
                      {repo.description || repo.language || "No description"}
                    </p>
                  </div>
                  <span className="pr-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-700 transition-colors group-hover:text-zinc-300">
                    Select
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-2xl space-y-4">
          <FieldInput
            label="GitHub repository URL"
            value={manualRepoUrl}
            onChange={(value) => {
              setManualRepoUrl(value);
              setManualRepoError("");
            }}
            placeholder="https://github.com/owner/repo"
            onEnter={onManualContinue}
          />
          <p className="text-sm leading-6 text-zinc-600">
            Public repositories work immediately. Private repositories work if your
            connected GitHub account has access.
          </p>
          {manualRepoError && (
            <p className="text-sm text-[#d86666]">{manualRepoError}</p>
          )}
          <Button variant="primary" onClick={onManualContinue}>
            Use Repository
          </Button>
        </div>
      )}
    </div>
  );
}

function SourceTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-8 rounded px-3 text-[10px] font-semibold uppercase tracking-[0.16em] transition-all cursor-pointer",
        active
          ? "bg-white text-black"
          : "text-zinc-600 hover:bg-white/[0.045] hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function SelectedSource({
  repo,
  repoSourceLabel,
  buildStatusLabel,
  hasDockerfile,
  checkingDocker,
}: {
  repo: Repo | null;
  repoSourceLabel: string;
  buildStatusLabel: string;
  hasDockerfile: boolean | null;
  checkingDocker: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 border-y border-white/[0.08] py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-700">
          {repoSourceLabel}
        </p>
        <p className="truncate text-sm font-medium text-zinc-200">
          {repo?.full_name}
        </p>
        <p className="mt-1 truncate text-xs text-zinc-700">{repo?.html_url}</p>
      </div>
      <StatusText
        tone={hasDockerfile === true ? "success" : hasDockerfile === false ? "danger" : "muted"}
        pulse={checkingDocker}
      >
        {buildStatusLabel}
      </StatusText>
    </div>
  );
}

function DeploymentPreview({
  hasSource,
  projectName,
  selectedRepo,
  repoSourceLabel,
  productionUrl,
  port,
  branch,
  dockerfileDirectory,
  buildStatusLabel,
  hasDockerfile,
  checkingDocker,
  envVarCount,
  validationErrors,
  preflight,
  deploying,
  onDeploy,
}: {
  hasSource: boolean;
  projectName: string;
  selectedRepo: Repo | null;
  repoSourceLabel: string;
  productionUrl: string;
  port: string;
  branch: string;
  dockerfileDirectory: string;
  buildStatusLabel: string;
  hasDockerfile: boolean | null;
  checkingDocker: boolean;
  envVarCount: number;
  validationErrors: string[];
  preflight: { label: string; ready: boolean }[];
  deploying: boolean;
  onDeploy: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.025]">
      <div className="border-b border-white/[0.08] px-5 py-4">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-600">
          Deployment Preview
        </p>
        <h2 className="mt-3 truncate text-2xl font-medium tracking-tight text-white">
          {hasSource ? projectName || "Untitled service" : "Select a source"}
        </h2>
        <p className="mt-2 truncate text-sm text-zinc-600">
          {hasSource
            ? selectedRepo?.full_name
            : "Repository details appear here once selected."}
        </p>
      </div>

      {hasSource ? (
        <>
          <div className="grid grid-cols-1 divide-y divide-white/[0.06] px-5">
            <PreviewRow label="Source" value={repoSourceLabel} />
            <PreviewRow label="Production URL" value={productionUrl} />
            <PreviewRow label="Port" value={port ? `TCP/${port}` : "Not set"} />
            <PreviewRow label="Branch" value={branch || "Not set"} />
            <PreviewRow label="Dockerfile directory" value={dockerfileDirectory} />
            <PreviewRow
              label="Dockerfile"
              value={buildStatusLabel}
              tone={
                hasDockerfile === true
                  ? "success"
                  : hasDockerfile === false
                    ? "danger"
                    : "muted"
              }
              pulse={checkingDocker}
            />
            <PreviewRow
              label="Environment"
              value={`${envVarCount} variable${envVarCount === 1 ? "" : "s"}`}
            />
          </div>

          <div className="border-t border-white/[0.08] px-5 py-4">
            <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-700">
              Preflight
            </p>
            <div className="space-y-2.5">
              {preflight.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-4"
                >
                  <StatusText tone={item.ready ? "success" : "muted"}>
                    {item.label}
                  </StatusText>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-700">
                    {item.ready ? "Ready" : "Needed"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {hasDockerfile === false && !checkingDocker && (
            <div className="border-t border-white/[0.08] px-5 py-4">
              <p className="text-sm leading-6 text-[#d8ad4f]">
                Dockerfile not found in this directory. Deployment is blocked
                until the build path is corrected.
              </p>
            </div>
          )}

          <div className="border-t border-white/[0.08] px-5 py-4">
            <p className="mb-4 text-sm leading-6 text-zinc-600">
              Hatch will clone the branch, build the image, publish it, and route
              traffic after the target becomes healthy.
            </p>
            <Button
              variant="primary"
              className="w-full"
              onClick={onDeploy}
              disabled={deploying || validationErrors.length > 0}
            >
              {deploying ? "Deploying..." : "Deploy Service"}
            </Button>
            {validationErrors.length > 0 && (
              <p className="mt-3 text-center text-xs text-zinc-700">
                {validationErrors[0]}
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="px-5 py-5">
          <div className="space-y-3">
            {[
              "Choose repository",
              "Verify Dockerfile",
              "Configure service",
              "Queue deployment",
            ].map((item, index) => (
              <div
                key={item}
                className="flex items-center gap-3 border-b border-white/[0.055] pb-3 last:border-b-0"
              >
                <span className="font-mono text-[10px] text-zinc-800">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm text-zinc-600">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SetupSection({
  index,
  title,
  description,
  action,
  children,
}: {
  index: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-white/[0.08] pb-8 last:border-b-0">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-4">
          <span className="pt-1 font-mono text-[10px] text-zinc-700">{index}</span>
          <div>
            <h2 className="text-lg font-medium tracking-tight text-white">
              {title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600">
              {description}
            </p>
          </div>
        </div>
        {action && <div className="shrink-0 pl-[60px] sm:pl-0">{action}</div>}
      </div>
      <div className="pl-0 sm:pl-[60px]">{children}</div>
    </section>
  );
}

function PreviewRow({
  label,
  value,
  tone = "default",
  pulse = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger" | "muted";
  pulse?: boolean;
}) {
  const colors = {
    default: "text-zinc-300",
    success: "text-[#5cc98f]",
    danger: "text-[#d86666]",
    muted: "text-zinc-600",
  } satisfies Record<typeof tone, string>;

  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-4 py-3.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-700">
        {label}
      </span>
      <span
        title={value}
        className={cn(
          "truncate text-right font-mono text-xs font-medium",
          colors[tone],
          pulse && "animate-pulse",
        )}
      >
        {value || "Not set"}
      </span>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onEnter?: () => void;
}) {
  return (
    <div className="space-y-2.5">
      <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
        {label}
      </label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onEnter?.();
        }}
        placeholder={placeholder}
        className="w-full border-b border-white/[0.11] bg-transparent py-3 text-sm text-zinc-200 outline-none transition-colors placeholder:text-zinc-800 focus:border-white/35"
      />
    </div>
  );
}

function ListMessage({ text }: { text: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-700">
        {text}
      </p>
    </div>
  );
}

function parseGitHubRepoUrl(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  const normalized = raw
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");

  try {
    const url = new URL(normalized);
    if (url.hostname !== "github.com") return null;
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repo) return null;
    return {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      url: `https://github.com/${owner}/${repo}`,
    };
  } catch {
    const [owner, repo] = normalized.split("/").filter(Boolean);
    if (!owner || !repo || normalized.includes("://")) return null;
    return {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      url: `https://github.com/${owner}/${repo}`,
    };
  }
}
