import UnavailablePage from "@/components/UnavailablePage";

export default function CostPage() {
  return (
    <UnavailablePage
      title="Cost"
      description="What your projects cost to run, against the monthly cap you set."
      emptyTitle="Nothing to show yet"
      emptyDescription="Estimated spend, your monthly cap and a per-project breakdown appear here once an AWS account is connected."
    />
  );
}
