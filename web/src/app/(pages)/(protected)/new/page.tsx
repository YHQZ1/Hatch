import NewProjectClient from "./NewProjectClient";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deploy a new service",
  description: "Provision new infrastructure on the Hatch cloud.",
};

export default function Page() {
  return <NewProjectClient />;
}
