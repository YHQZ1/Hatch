import ActivityClient from "./ActivityClient";

export const metadata = {
  title: "Trace",
  description: "Infrastructure event stream.",
};

export default function Page() {
  return <ActivityClient />;
}
