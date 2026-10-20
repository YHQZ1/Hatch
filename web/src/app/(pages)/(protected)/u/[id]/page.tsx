import ProfileClient from "./UserClient";

export const metadata = {
  title: "Account Settings",
  description: "Manage your Hatch account and GitHub connection settings.",
};

export default function Page() {
  return <ProfileClient />;
}
