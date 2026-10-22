import { useState } from "react";
import { deploymentUrl, productionHost } from "@/lib/api";
import Field from "../newProject/Field";
import CopyUrlButton from "../overview/CopyUrlButton";
import { RepoLink } from "../overview/RepoLink";
import { formatRepoSlug, projectName } from "../services/service";
import Section from "./Section";
import type { SectionProps } from "./types";

/**
 * The project's name, which can be changed, and the two things that cannot:
 * its address, which Hatch gave it when it was created, and its repository.
 */
export default function GeneralSection({ project, save, saving }: SectionProps) {
  const saved = projectName(project);
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? saved;
  const dirty = name.trim() !== "" && name.trim() !== saved;
  const address = deploymentUrl(productionHost(project.subdomain));

  return (
    <Section
      id="general"
      title="General"
      description="The name you see across Hatch. The address and repository are fixed once a project exists."
      footer={{
        dirty,
        saving,
        onDiscard: () => setDraft(null),
        onSave: async () => {
          if (await save({ repo_name: name.trim() }, { title: "Name saved", message: `The project is now called ${name.trim()}.` })) {
            setDraft(null);
          }
        },
      }}
    >
      <Field label="Project name" value={name} onChange={setDraft} placeholder="my-project" />

      <dl className="mt-6 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
        <dt className="text-muted">Address</dt>
        <dd className="flex min-w-0 items-center gap-1">
          {address ? (
            <>
              <a
                href={address}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate transition-colors hover:underline"
              >
                {address.replace(/^https?:\/\//, "")}
              </a>
              <CopyUrlButton url={address} />
            </>
          ) : (
            <span className="text-faint">Not assigned</span>
          )}
        </dd>

        <dt className="text-muted">Repository</dt>
        <dd className="flex min-w-0">
          <RepoLink url={project.repo_url} slug={formatRepoSlug(project.repo_url)} />
        </dd>

        <dt className="text-muted">Created</dt>
        <dd title={new Date(project.created_at).toLocaleString()}>
          {new Date(project.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </dd>
      </dl>
    </Section>
  );
}
