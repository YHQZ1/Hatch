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
          {
            path: "insights",
            handle: { title: "Insights" },
            ...page(() => import("./routes/Insights")),
          },
          {
            path: "activity",
            handle: { title: "Activity" },
            ...page(() => import("./routes/Activity")),
          },
          {
            path: "new",
            handle: { title: "New project" },
            ...page(() => import("./routes/NewProject")),
          },
          {
            path: "projects/:id",
            handle: { title: "Project" },
            ...page(() => import("./routes/Project")),
          },
          {
            path: "projects/:id/settings",
            handle: { title: "Project Settings" },
            ...page(() => import("./routes/ProjectSettings")),
          },
          {
            path: "projects/:id/deployments/:deploymentId",
            handle: { title: "Deployment Summary" },
            ...page(() => import("./routes/Deployment")),
          },
          {
            path: "settings",
            handle: { title: "Settings" },
            ...page(() => import("./routes/Settings")),
          },
          // Settings used to live at /u/<username>.
          { path: "u/:id", element: <Navigate to="/settings" replace /> },
          {
            path: "infrastructure",
            element: <Navigate to="/insights" replace />,
          },
        ],
      },
      { path: "*", ...page(() => import("./routes/NotFound")) },
    ],
  },
]);
