import { SectionLayout, SettingRow, SettingsCard } from "./primitives";

const GUARDRAILS = [
  {
    label: "Cost estimate before every deploy",
    description: "See the expected monthly cost before anything is created.",
  },
  {
    label: "Monthly spend cap",
    description: "A warning at 80% of your cap, and new deploys blocked at 100%.",
  },
  {
    label: "Pause when idle",
    description: "Warn after 7 days without requests and pause after 14, per project.",
  },
  {
    label: "Expiry for test apps",
    description: "Delete a project on its own after an hour, a day or a week.",
  },
  {
    label: "Tear down everything",
    description: "Remove everything Hatch created in your account, with a verified report.",
  },
];

/** The cost guardrails, listed where their settings will live. They need AWS. */
export default function GuardrailsSection() {
  return (
    <SectionLayout
      main={
        <SettingsCard
          title="Spend and cleanup"
          description="Controls that stop a forgotten test from becoming a surprise bill."
        >
          {GUARDRAILS.map((item) => (
            <SettingRow key={item.label} label={item.label} description={item.description}>
              <span className="whitespace-nowrap text-sm text-faint">Not available yet</span>
            </SettingRow>
          ))}
        </SettingsCard>
      }
      aside={
        <SettingsCard title="Why these exist">
          <SettingRow
            label="Nothing runs or bills without you knowing"
            description="Every resource Hatch creates is recorded, tagged and shown in one place, and cleaning up is one action."
          />
          <SettingRow
            label="They arrive with AWS"
            description="They rely on an account being connected, so they appear here once connecting does."
          />
        </SettingsCard>
      }
    />
  );
}
