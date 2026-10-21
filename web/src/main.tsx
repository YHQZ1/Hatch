import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { loadAppConfig } from "@/lib/api";
import { router } from "./router";

// Public server settings (such as the apps' base domain) are needed
// synchronously by URL helpers, so load them before the first render.
await loadAppConfig();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
