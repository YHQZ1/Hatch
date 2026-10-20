import ProjectClient from "./ProjectClient";

export const metadata = {
  title: "Deployment Console",
  description: "Real-time deployment logs and service management.",
};

export default function Page() {
  return <ProjectClient />;
}