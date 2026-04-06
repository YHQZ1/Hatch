import InfrastructureClient from "./InfrastructureClient";

export const metadata = {
  title: "System Infrastructure",
  description:
    "Real-time status of ECS clusters, Load Balancers, and Eargate fleet.",
};

export default function Page() {
  return <InfrastructureClient />;
}
