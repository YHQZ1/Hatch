import { useId, useState } from "react";
import { Button } from "@/components/ui";
import { INPUT_CLASS } from "@/routes/newProject/Field";
import { cn } from "@/lib/cn";
import { roleArnProblem } from "./awsConnection";

/** Where the user gives Hatch the role their stack created. */
export default function RoleForm({
  initial = "",
  busy,
  action,
  onSubmit,
}: {
  initial?: string;
  busy: boolean;
  /** What the button says. */
  action: string;
  onSubmit: (roleArn: string) => Promise<boolean>;
}) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const problem = roleArnProblem(value);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (problem || busy) return;
    await onSubmit(value);
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        Role ARN
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id={id}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="arn:aws:iam::123456789012:role/hatch-control"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={attempted && problem ? true : undefined}
          className={cn(INPUT_CLASS, "min-w-0 sm:flex-1", attempted && problem && "border-danger")}
        />
        <Button type="submit" variant="primary" disabled={busy} className="h-10 shrink-0">
          {busy ? "Working…" : action}
        </Button>
      </div>
      {attempted && problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
    </form>
  );
}
