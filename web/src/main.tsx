import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { clearClientSession, loadAppConfig } from "@/lib/api";
import { createQueryClient } from "@/lib/queryClient";
import { persistQueryCache, restoreQueryCache } from "@/lib/queryPersistence";
import { router } from "./router";

// Public server settings (such as the apps' base domain) are needed
// synchronously by URL helpers, so load them before the first render. The
// fonts load alongside, so the first frame of text is already in the right
// typeface instead of swapping a moment later. A slow font must not hold the
// page up, hence the cap.
await Promise.all([
  loadAppConfig(),
  Promise.race([
    Promise.all([
      document.fonts.load("1rem 'Inter Variable'"),
      document.fonts.load("1rem 'JetBrains Mono Variable'"),
    ]),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]),
]);

const queryClient = createQueryClient(() => {
  clearClientSession();
  queryClient.clear();
  void router.navigate("/auth", { replace: true });
});

// Show the last-seen data straight away on a reload (see queryPersistence).
restoreQueryCache(queryClient);
persistQueryCache(queryClient);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
