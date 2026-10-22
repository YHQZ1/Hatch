import { useState } from "react";
import Field from "../newProject/Field";
import { dockerfilePathIn, folderOf } from "../newProject/newProject";
import Section from "./Section";
import type { SectionProps } from "./types";

const HEALTH_PATH = /^\/\S*$/;

/** How the next deployment is built and told it is healthy: the Dockerfile's folder, the port, the health path. */
export default function BuildSection({ project, save, saving, onAppliesNextDeploy }: SectionProps) {
  const savedFolder = folderOf(project.dockerfile_path);
  const [folderDraft, setFolder] = useState<string | null>(null);
  const [portDraft, setPort] = useState<string | null>(null);
  const [healthDraft, setHealth] = useState<string | null>(null);
  const folder = folderDraft ?? savedFolder;
  const port = portDraft ?? String(project.port);
  const health = healthDraft ?? project.health_check;

  const portNumber = Number(port);
  const portError = !Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535 ? "Use a port from 1 to 65535." : undefined;
  const healthError = HEALTH_PATH.test(health.trim()) ? undefined : "Start with a slash, with no spaces, like /health.";
  const folderChanged = dockerfilePathIn(folder) !== project.dockerfile_path;
  const dirty = folderChanged || portNumber !== project.port || health.trim() !== project.health_check;

  const discard = () => {
    setFolder(null);
    setPort(null);
    setHealth(null);
  };

  return (
    <Section
      id="build"
      title="Build and run"
      description="How Hatch builds the image and knows the container is up."
      footer={{
        dirty,
        problem: portError ?? healthError ?? null,
        saving,
        note: "Applies to the next deployment.",
        onDiscard: discard,
        onSave: async () => {
          const saved = await save(
            {
              dockerfile_path: dockerfilePathIn(folder),
              port: portNumber,
              health_check: health.trim(),
            },
            { title: "Build settings saved", message: "They apply to the next deployment." },
          );
          if (!saved) return;
          discard();
          onAppliesNextDeploy();
        },
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Dockerfile folder"
          value={folder}
          onChange={setFolder}
          placeholder="./"
          hint="Relative to the repository root."
          className="sm:col-span-2"
        />
        <Field
          label="Port"
          value={port}
          onChange={(value) => setPort(value.replace(/[^0-9]/g, ""))}
          placeholder="8080"
          error={dirty ? portError : undefined}
          hint="The port your app listens on in the container."
        />
        <Field
          label="Health check path"
          value={health}
          onChange={setHealth}
          placeholder="/health"
          error={dirty ? healthError : undefined}
          hint="Must answer before a deployment is called live."
        />
      </div>
    </Section>
  );
}
