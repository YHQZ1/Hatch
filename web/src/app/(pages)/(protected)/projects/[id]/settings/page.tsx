import ProjectSettingsClient from "./ProjectSettingsClient";

export const metadata = {
  title: "Service Settings",
  description:
    "Configure environment variables, auto-deployments, and infrastructure lifecycle.",
};

export default function Page() {
  return <ProjectSettingsClient />;
}
