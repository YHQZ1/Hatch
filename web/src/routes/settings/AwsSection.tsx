import { SectionLayout, SettingRow, SettingsCard } from "./primitives";

/**
 * Where the AWS connection will live. Connecting arrives with Phase 2, so this
 * explains how it will work instead of offering a control that does nothing.
 */
export default function AwsSection() {
  return (
    <SectionLayout
      main={
        <SettingsCard
          title="AWS account"
          description="Hatch deploys into an AWS account you own, so the bill is yours."
        >
          <SettingRow
            label="Not connected"
            description="Connecting an account arrives in the next phase of Hatch."
          />
          <SettingRow
            label="How connecting will work"
            description="You launch one CloudFormation stack in your account. It creates a role that Hatch assumes with a per-connection ExternalId. Hatch never asks for, or stores, AWS access keys."
            stacked
          />
        </SettingsCard>
      }
      aside={
        <SettingsCard
          title="What the stack will create"
          description="Everything is named hatch- and tagged hatch:managed, and Hatch can only touch what it created."
        >
          <SettingRow label="A role for Hatch" description="Limited to Hatch's own resources, plus the reads it needs." />
          <SettingRow label="Network and cluster" description="A VPC, an ECS cluster and one shared load balancer with HTTPS." />
          <SettingRow label="Build and registry" description="A CodeBuild project, an image repository and a log group." />
          <SettingRow label="A budget alarm" description="Emails you at 50%, 80% and 100% of the monthly limit you choose." />
        </SettingsCard>
      }
    />
  );
}
