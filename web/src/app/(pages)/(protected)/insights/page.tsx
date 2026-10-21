import InsightsClient from "./InsightsClient";

export const metadata = {
  title: "Insights",
  description: "Application behaviour and deployment health.",
};

export default function Page() {
  return <InsightsClient />;
}
