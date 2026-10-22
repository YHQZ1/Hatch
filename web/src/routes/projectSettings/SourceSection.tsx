import { useState } from "react";
import Switch from "@/components/Switch";
import Field from "../newProject/Field";
import Section from "./Section";
import type { SectionProps } from "./types";

/** Which branch Hatch builds, and whether a push to it deploys by itself. */
export default function SourceSection({ project, save, saving, onAppliesNextDeploy }: SectionProps) {
  const [branchDraft, setBranch] = useState<string | null>(null);
  const [autoDraft, setAuto] = useState<boolean | null>(null);
  const branch = branchDraft ?? project.branch;
  const auto = autoDraft ?? project.auto_deploy;
  const dirty = (branch.trim() !== "" && branch.trim() !== project.branch) || auto !== project.auto_deploy;

  const discard = () => {
    setBranch(null);
    setAuto(null);
  };

  return (
    <Section
      id="source"
      title="Source"
      description="Where Hatch gets the code to build."
      footer={{
        dirty,
        saving,
        note: "A new branch is used from the next deployment.",
        onDiscard: discard,
        onSave: async () => {
          const branchChanged = branch.trim() !== project.branch;
          const saved = await save(
            { branch: branch.trim(), auto_deploy: auto },
            { title: "Source saved", message: "Your changes to the branch and auto-deploy are in effect." },
          );
          if (!saved) return;
          discard();
          if (branchChanged) onAppliesNextDeploy();
        },
      }}
    >
      <Field label="Branch" value={branch} onChange={setBranch} placeholder="main" hint="Hatch builds and deploys this branch." />

      <div className="mt-6 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-sm font-medium">Deploy on every push</p>
          <p className="mt-1 text-xs leading-relaxed text-faint">
            Hatch asks GitHub to tell it about pushes to the branch. GitHub has to be able to reach this Hatch
            server for that, so it does not work from localhost.
          </p>
        </div>
        <Switch checked={auto} onChange={setAuto} label="Deploy on every push" />
      </div>
    </Section>
  );
}
