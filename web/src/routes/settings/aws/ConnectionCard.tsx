import { useState } from "react";
import { Button, Modal } from "@/components/ui";
import { SettingRow, SettingsCard } from "../primitives";
import { cn } from "@/lib/cn";
import type { CloudConnection } from "@/lib/types";
import RoleForm from "./RoleForm";
import { consoleUrl, regionLabel, stageOf } from "./awsConnection";
import type { ConnectionActions } from "./useConnectionActions";

const DESCRIPTION = {
  "create-stack": "Create the stack in your account, then give Hatch the role it makes.",
  checking: "Hatch is checking the connection. This takes a few seconds.",
  failed: "The last check did not pass. Fix what it says, then check again.",
  connected: "Hatch can reach this account.",
} as const;

function when(iso: string | null): string {
  if (!iso) return "never";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "never" : date.toLocaleString();
}

/** One connection, in whichever stage it has reached, and what to do next. */
export default function ConnectionCard({
  connection,
  actions,
}: {
  connection: CloudConnection;
  actions: ConnectionActions;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const stage = stageOf(connection);
  const busy = actions.busy !== null;
  const mine = actions.busy === connection.id;
  const link = consoleUrl(connection);

  return (
    <SettingsCard
      title={regionLabel(connection.region)}
      description={`${connection.region} · ${DESCRIPTION[stage]}`}
    >
      {stage === "create-stack" && (
        <>
          <SettingRow
            label="1. Create the stack"
            description="Opens your AWS console with everything filled in. Review it, tick the box that says it creates IAM roles, and choose Create stack. It takes a few minutes."
            stacked
          >
            {link ? (
              <Button href={link} variant="primary">
                Open in the AWS console ↗
              </Button>
            ) : (
              <p className="text-sm text-muted">This server could not build the link. Remove this connection and try again.</p>
            )}
          </SettingRow>
          <SettingRow
            label="2. Give Hatch the role"
            description="When the stack shows CREATE_COMPLETE, open its Outputs tab and copy the value of ControlRoleArn."
            stacked
          >
            <div className="w-full">
              <RoleForm
                busy={mine}
                action="Check the connection"
                onSubmit={(arn) => actions.giveRole(connection.id, arn)}
              />
            </div>
          </SettingRow>
        </>
      )}

      {stage === "checking" && (
        <SettingRow label="Checking" description={connection.role_arn ?? undefined}>
          <span className="flex items-center gap-2 text-sm text-muted" role="status">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            Working…
          </span>
        </SettingRow>
      )}

      {stage === "failed" && (
        <>
          <SettingRow label="What went wrong" stacked>
            <p role="alert" className="text-sm leading-relaxed text-danger">
              {connection.last_error ?? "The check did not pass."}
            </p>
          </SettingRow>
          <SettingRow
            label="Check again"
            description="If the stack was still being created, or you have fixed it, check again. To use a different role, replace it first."
            stacked
          >
            <div className="w-full space-y-3">
              <RoleForm
                initial={connection.role_arn ?? ""}
                busy={mine}
                action="Save and check"
                onSubmit={(arn) => actions.giveRole(connection.id, arn)}
              />
              <Button onClick={() => void actions.checkAgain(connection.id)} disabled={busy}>
                {mine ? "Working…" : "Check again"}
              </Button>
            </div>
          </SettingRow>
          {link && (
            <SettingRow
              label="Stack not created yet?"
              description="The same link opens it again."
            >
              <Button href={link}>Open in the AWS console ↗</Button>
            </SettingRow>
          )}
        </>
      )}

      {stage === "connected" && (
        <>
          <SettingRow label="Status" description={`Last checked ${when(connection.last_verified_at)}`}>
            <span className="flex items-center gap-2 text-sm font-medium">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
              Connected
            </span>
          </SettingRow>
          <SettingRow label="AWS account">
            <span className="font-mono text-sm">{connection.aws_account_id}</span>
          </SettingRow>
          <SettingRow
            label="Apps are served over"
            description={
              connection.serves_https
                ? "HTTPS, with your certificate."
                : "Traffic to your apps is not encrypted. That is fine for trying Hatch, but not for anything private. To serve them over HTTPS, connect with a certificate for your domain."
            }
          >
            <span className={cn("text-sm font-medium", !connection.serves_https && "text-warning")}>
              {connection.serves_https ? "HTTPS" : "HTTP only"}
            </span>
          </SettingRow>
          <SettingRow
            label="Budget alert"
            description={`AWS emails ${connection.budget_email} at 50%, 80% and 100% of it. It watches the whole account.`}
          >
            <span className="text-sm font-medium">${connection.monthly_budget_usd} a month</span>
          </SettingRow>
          <SettingRow
            label="Stack template"
            description={
              connection.template_up_to_date === false
                ? "The stack was made from an older version of the template. It still works."
                : undefined
            }
          >
            <span className="text-sm font-medium">
              {connection.template_up_to_date === false ? "An older version" : "Up to date"}
            </span>
          </SettingRow>
          <SettingRow label="Check the connection again" description="Checks that Hatch can still assume the role and read the stack.">
            <Button onClick={() => void actions.checkAgain(connection.id)} disabled={busy}>
              {mine ? "Working…" : "Check again"}
            </Button>
          </SettingRow>
        </>
      )}

      <SettingRow
        label="Remove this connection"
        description="Hatch forgets it. Nothing in your AWS account changes."
      >
        <Button variant="danger" onClick={() => setConfirmRemove(true)} disabled={busy}>
          Remove…
        </Button>
      </SettingRow>

      <Modal
        open={confirmRemove}
        title="Remove this connection?"
        description="Hatch will forget the connection and stop being able to reach the account. Nothing is deleted in AWS, and the stack keeps running with its load balancer, which is billed by the hour. To stop that, delete the hatch-connect stack in the CloudFormation console."
        onClose={() => setConfirmRemove(false)}
      >
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              void actions.remove(connection.id).then((removed) => {
                if (removed) setConfirmRemove(false);
              })
            }
          >
            {mine ? "Removing…" : "Remove connection"}
          </Button>
        </div>
      </Modal>
    </SettingsCard>
  );
}
