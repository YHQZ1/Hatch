import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { NoticePayload } from "@/components/NoticeToast";
import { Button } from "@/components/ui";
import { getAppConfig } from "@/lib/api";
import { NO_CONNECTIONS, connectionsQuery } from "@/lib/queries";
import ConnectForm from "./aws/ConnectForm";
import ConnectionCard from "./aws/ConnectionCard";
import { CREATING, useConnectionActions } from "./aws/useConnectionActions";
import { SectionLayout, SettingRow, SettingsCard } from "./primitives";

/** The user's AWS connections: start one, finish it in their console, see it checked. */
export default function AwsSection({ notify }: { notify: (notice: NoticePayload) => void }) {
  const result = useQuery(connectionsQuery());
  const connections = result.data ?? NO_CONNECTIONS;
  const actions = useConnectionActions(notify);
  const [adding, setAdding] = useState(false);
  const available = getAppConfig().awsConnections;

  return (
    <SectionLayout
      main={
        result.isPending ? (
          <SettingsCard title="AWS account" description="Hatch deploys into an AWS account you own, so the bill is yours.">
            <div className="space-y-3 px-5 py-5" aria-hidden>
              <div className="h-4 w-1/3 animate-pulse rounded-hatch bg-line" />
              <div className="h-4 w-1/2 animate-pulse rounded-hatch bg-line/60" />
            </div>
          </SettingsCard>
        ) : result.isError ? (
          <SettingsCard title="AWS account">
            <p className="px-5 py-5 text-sm text-danger">
              We couldn&apos;t load your connections just now. Try again in a moment.
            </p>
          </SettingsCard>
        ) : (
          <>
            {connections.map((connection) => (
              <ConnectionCard key={connection.id} connection={connection} actions={actions} />
            ))}

            {!available && connections.length === 0 && (
              <SettingsCard
                title="AWS account"
                description="Hatch deploys into an AWS account you own, so the bill is yours."
              >
                <SettingRow
                  label="Not available on this server"
                  description="This Hatch server is not set up to connect AWS accounts. Whoever runs it can switch it on; the setup is in the project's documentation."
                  stacked
                />
              </SettingsCard>
            )}

            {available && (connections.length === 0 || adding) && (
              <ConnectForm
                busy={actions.busy === CREATING}
                onSubmit={async (form) => {
                  const ok = await actions.create(form);
                  if (ok) setAdding(false);
                  return ok;
                }}
                onCancel={connections.length > 0 ? () => setAdding(false) : undefined}
              />
            )}

            {available && connections.length > 0 && !adding && (
              <div>
                <Button onClick={() => setAdding(true)} disabled={actions.busy !== null}>
                  Connect another region
                </Button>
              </div>
            )}
          </>
        )
      }
      aside={
        <>
          <SettingsCard
            title="What the stack creates"
            description="Everything is named hatch- and tagged hatch:managed, and Hatch can only touch what it created."
          >
            <SettingRow label="A role for Hatch" description="Limited to Hatch's own resources, plus the reads it needs. Only this Hatch can assume it, and only with your connection's own ExternalId." />
            <SettingRow label="Network and cluster" description="A VPC, an ECS cluster and one shared load balancer, which is the account's fixed cost." />
            <SettingRow label="Build and registry" description="A CodeBuild project, an image repository and a log group." />
            <SettingRow label="A budget alert" description="Emails you at 50%, 80% and 100% of the monthly limit you choose." />
          </SettingsCard>
          <SettingsCard title="What Hatch keeps">
            <SettingRow label="No access keys" description="Hatch keeps the role's name, the region and what the stack reports about itself, and assumes the role for a few minutes at a time." />
            <SettingRow label="Your apps and code" description="They are built and run in your account, never on Hatch's server." />
          </SettingsCard>
        </>
      }
    />
  );
}
