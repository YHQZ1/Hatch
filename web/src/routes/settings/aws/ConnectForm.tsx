import { useState } from "react";
import { Button } from "@/components/ui";
import SelectField from "@/components/SelectField";
import Field from "@/routes/newProject/Field";
import { ExternalLink, SettingsCard } from "../primitives";
import { type ConnectForm as Form, EMPTY_FORM, REGIONS, formProblem } from "./awsConnection";

const LOAD_BALANCER_PRICING = "https://aws.amazon.com/elasticloadbalancing/pricing/";

/**
 * Starts a connection: where the account's stack will live, a monthly limit to be
 * emailed about, and optionally a certificate for HTTPS. It says plainly what the
 * account will always cost before anything is created.
 */
export default function ConnectForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (form: Form) => Promise<boolean>;
  /** Given when this is an extra connection rather than the first. */
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [attempted, setAttempted] = useState(false);
  const problem = formProblem(form);
  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (problem || busy) return;
    if (await onSubmit(form)) {
      setForm(EMPTY_FORM);
      setAttempted(false);
    }
  }

  return (
    <SettingsCard
      title="Connect an AWS account"
      description="Hatch deploys into an AWS account you own, so the bill is yours. You will create one stack there; Hatch never asks for access keys."
    >
      <form onSubmit={submit} className="space-y-5 px-5 py-5">
        <div>
          {/* The select names itself for screen readers; this is the visible heading. */}
          <p aria-hidden className="mb-1.5 text-sm font-medium">
            Region
          </p>
          <SelectField
            label="Region"
            value={form.region}
            onChange={(region) => set({ region })}
            options={REGIONS.map((region) => ({ value: region.value, label: `${region.label} · ${region.value}` }))}
            className="w-full"
          />
          <p className="mt-1.5 text-xs text-muted">Apps run in one region per connection.</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Monthly limit (US dollars)"
            value={form.budget}
            onChange={(budget) => set({ budget })}
            hint="AWS emails you at 50%, 80% and 100% of it."
          />
          <Field
            label="Send alerts to"
            value={form.email}
            onChange={(email) => set({ email })}
            placeholder="you@example.com"
          />
        </div>

        <Field
          label="Certificate for HTTPS (optional)"
          value={form.certificate}
          onChange={(certificate) => set({ certificate })}
          placeholder="arn:aws:acm:…:certificate/…"
          hint="The ARN of an ACM certificate in this region for your apps' domain. Without one, apps are served over plain HTTP on the load balancer's address."
        />

        <p className="rounded-hatch border border-line px-4 py-3 text-sm leading-relaxed text-muted">
          The account has one fixed cost: its load balancer is billed by the hour whether or not any
          app is running. See{" "}
          <ExternalLink href={LOAD_BALANCER_PRICING}>the load balancer prices</ExternalLink> for your
          region.
        </p>

        {attempted && problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Creating…" : "Create the connection"}
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </SettingsCard>
  );
}
