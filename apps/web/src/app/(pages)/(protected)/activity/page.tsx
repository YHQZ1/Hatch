import ActivityClient from "./ActivityClient";

export const metadata = {
  title: "Your Activity",
  description: "Infrastructure event stream.",
};

export default function Page() {
  return <ActivityClient />;
}
