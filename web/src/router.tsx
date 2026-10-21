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
      { path: "auth", ...page(() => import("./routes/Auth")) },
      { path: "auth/success", ...page(() => import("./routes/AuthSuccess")) },
      {
        Component: ProtectedLayout,
        children: [
          {
            path: "console",
            handle: { title: "Deployment Console" },
            ...page(() => import("./routes/Console")),
          },
          {
            path: "insights",
            handle: { title: "Insights" },
            ...page(() => import("./routes/Insights")),
          },
          {
            path: "activity",
            handle: { title: "Your Activity" },
            ...page(() => import("./routes/Activity")),
          },
          {
            path: "new",
            handle: { title: "Deploy a new service" },
            ...page(() => import("./routes/NewProject")),
          },
          {
            path: "projects/:id",
            handle: { title: "Deployment Console" },
            ...page(() => import("./routes/Project")),
          },
          {
            path: "projects/:id/settings",
            handle: { title: "Service Settings" },
            ...page(() => import("./routes/ProjectSettings")),
          },
          {
            path: "projects/:id/deployments/:deploymentId",
            handle: { title: "Deployment Summary" },
            ...page(() => import("./routes/Deployment")),
          },
          {
            path: "u/:id",
            handle: { title: "Account Settings" },
            ...page(() => import("./routes/User")),
          },
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
