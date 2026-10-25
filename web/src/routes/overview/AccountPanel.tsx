import { Link } from "react-router";
import { Panel } from "@/components/ui";
import { useAwsConnection } from "@/lib/aws";
import PanelHeader from "./PanelHeader";

/**
 * For an account that is not connected yet: the account, and the month's cost,
 * which arrives with the cost phase. It says in plain words what will appear
 * and when, and shows no made-up numbers. Once an account is connected it is
 * gone; the connection itself is on the AWS page of Settings.
 */
export default function AccountPanel({ className }: { className?: string }) {
  const { connected, loading } = useAwsConnection();
  if (connected) return null;

  return (
    <Panel className={className}>
      <PanelHeader title="AWS and cost" />
      <dl className="divide-y divide-line text-[13px]">
        <div className="flex h-11 items-center justify-between px-4">
          <dt className="text-muted">Cost this month</dt>
          <dd className="font-medium text-faint">—</dd>
        </div>
        <div className="flex h-11 items-center justify-between px-4">
          <dt className="text-muted">AWS account</dt>
          <dd className="flex items-center gap-2 font-medium text-muted">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-faint" />
            {loading ? "—" : "Not connected"}
          </dd>
        </div>
      </dl>
      <p className="border-t border-line p-4 text-[13px] leading-relaxed text-muted">
        Hatch deploys into an AWS account you own, so the bill is yours. Cost shows here, against a
        monthly cap, once the cost phase is built and an account is connected.{" "}
        <Link to="/settings?section=aws" className="text-accent transition-colors hover:text-accent-hover">
          Connect an account
        </Link>
        .
      </p>
    </Panel>
  );
}
