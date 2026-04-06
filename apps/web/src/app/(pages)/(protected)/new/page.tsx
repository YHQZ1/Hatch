import NewProjectClient from "./NewProjectClient";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Service",
  description: "Provision new infrastructure on the Hatch cloud.",
};

export default function Page() {
  return <NewProjectClient />;
}
