import DeploymentDetailClient from "./DeploymentDetailClient";

export const metadata = {
  title: "Deployment Summary",
  description:
    "Deep-dive into build artifacts, commit metadata, and runtime specifications.",
};

export default function Page() {
  return <DeploymentDetailClient />;
}
