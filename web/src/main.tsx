import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { clearClientSession, loadAppConfig } from "@/lib/api";
import { createQueryClient } from "@/lib/queryClient";
import { router } from "./router";

// Public server settings (such as the apps' base domain) are needed
// synchronously by URL helpers, so load them before the first render.
await loadAppConfig();

const queryClient = createQueryClient(() => {
  clearClientSession();
  queryClient.clear();
  void router.navigate("/auth", { replace: true });
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
