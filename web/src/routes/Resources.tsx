import UnavailablePage from "@/components/UnavailablePage";

export default function ResourcesPage() {
  return (
    <UnavailablePage
      title="Resources"
      description="Everything Hatch has created in your AWS account, and one place to remove it."
      emptyTitle="Nothing to show yet"
      emptyDescription="Every resource Hatch creates is listed here, tagged and costed, with a way to tear it all down, once an AWS account is connected."
    />
  );
}
