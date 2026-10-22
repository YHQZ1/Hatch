import type { ComponentType } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import InitialLoad from "@/components/InitialLoad";
import ProtectedLayout from "@/components/ProtectedLayout";
import RootLayout from "@/components/RootLayout";

type PageModule = { default: ComponentType };

/** A lazily loaded page, so each route is its own chunk. */
function page(load: () => Promise<PageModule>) {
  return {
    lazy: async () => ({ Component: (await load()).default }),
  };
}

export const router = createBrowserRouter([
  {
    Component: RootLayout,
    HydrateFallback: InitialLoad,
    children: [
      { index: true, ...page(() => import("./routes/Landing")) },
      {
        path: "auth",
        handle: { title: "Sign in" },
        ...page(() => import("./routes/Auth")),
      },
      { path: "auth/success", ...page(() => import("./routes/AuthSuccess")) },
      // The Overview used to live at /console.
      { path: "console", element: <Navigate to="/overview" replace /> },
      {
        Component: ProtectedLayout,
        children: [
          {
            path: "overview",
            handle: { title: "Overview" },
            ...page(() => import("./routes/Overview")),
          },
          // The projects are listed on the Overview; these paths are old links.
          { path: "projects", element: <Navigate to="/overview" replace /> },
          { path: "services", element: <Navigate to="/overview" replace /> },
          {
            path: "deployments",
            handle: { title: "Deployments" },
            ...page(() => import("./routes/Deployments")),
          },
          {
            path: "cost",
            handle: { title: "Cost" },
            ...page(() => import("./routes/Cost")),
          },
          {
            path: "resources",
            handle: { title: "Resources" },
            ...page(() => import("./routes/Resources")),
          },
          // Recent activity is a panel on the Overview; this path is an old link.
          { path: "activity", element: <Navigate to="/overview" replace /> },
          {
            path: "new",
            handle: { title: "New project" },
            ...page(() => import("./routes/NewProject")),
          },
          {
            path: "projects/:project",
            handle: { title: "Project" },
            ...page(() => import("./routes/Project")),
          },
          {
            path: "projects/:project/settings",
            handle: { title: "Project Settings" },
            ...page(() => import("./routes/ProjectSettings")),
          },
          // A deployment has a page of its own, named by its short id. It used to
          // live under its project; old links are sent to the new address.
          {
            path: "deployments/:id",
            handle: { title: "Deployment" },
            ...page(() => import("./routes/Deployment")),
          },
          {
            path: "projects/:project/deployments/:deployment",
            ...page(() => import("./routes/LegacyDeploymentRedirect")),
          },
          {
            path: "settings",
            handle: { title: "Settings" },
            ...page(() => import("./routes/Settings")),
          },
          // Settings used to live at /u/<username>.
          { path: "u/:id", element: <Navigate to="/settings" replace /> },
          // The Insights page is gone; its old addresses go to the Overview.
          { path: "insights", element: <Navigate to="/overview" replace /> },
          { path: "infrastructure", element: <Navigate to="/overview" replace /> },
        ],
      },
      { path: "*", ...page(() => import("./routes/NotFound")) },
    ],
  },
]);
