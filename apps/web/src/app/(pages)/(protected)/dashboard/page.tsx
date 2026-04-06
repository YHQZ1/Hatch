import DashboardClient from "./DashboardClient";

export const metadata = {
  title: "Dashboard",
  description: "Manage your Hatch web services and deployments.",
};

export default function Page() {
  return <DashboardClient />;
}
