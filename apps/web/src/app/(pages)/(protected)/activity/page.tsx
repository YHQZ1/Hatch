import ActivityClient from "./ActivityClient";

export const metadata = {
  title: "Activity Audit",
  description:
    "Global timeline of deployment events and configuration changes.",
};

export default function Page() {
  return <ActivityClient />;
}
