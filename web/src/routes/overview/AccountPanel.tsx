import { Link } from "react-router";
import { Panel } from "@/components/ui";
import { useAwsConnection } from "@/lib/aws";
import PanelHeader from "./PanelHeader";

/**
 * Holds the place of what the AWS phase brings: the account and the month's
 * cost. It says in plain words what will appear and when, and shows no made-up
 * numbers. The phase that connects an account replaces it.
 */
export default function AccountPanel({ className }: { className?: string }) {
  const { connected } = useAwsConnection();
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
            Not connected
          </dd>
        </div>
      </dl>
      <p className="border-t border-line p-4 text-[13px] leading-relaxed text-muted">
        Hatch deploys into an AWS account you own, so the bill is yours. Cost shows here, against a
        monthly cap, once one is connected.{" "}
        <Link to="/settings?section=aws" className="text-accent transition-colors hover:text-accent-hover">
          See how connecting works
        </Link>
        .
      </p>
    </Panel>
  );
}
