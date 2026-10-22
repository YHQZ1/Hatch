import { Navigate, useParams } from "react-router";
import { deploymentPath } from "@/lib/paths";

/** Deployment pages used to live under their project (`/projects/:project/deployments/:id`); old links land here. */
export default function LegacyDeploymentRedirect() {
  const { deployment = "" } = useParams();
  return <Navigate to={deploymentPath({ id: deployment })} replace />;
}
