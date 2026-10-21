import ConsoleClient from "./ConsoleClient";

export const metadata = {
  title: "Deployment Console",
  description: "Manage and monitor your cloud infrastructure.",
};

export default function Page() {
  return <ConsoleClient />;
}
