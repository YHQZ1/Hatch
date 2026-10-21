import { QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

/**
 * The app's query client. A 401 from any query means the session ended, so
 * onUnauthorized runs (it signs the user out and goes to /auth). Errors the
 * server caused by the request itself (4xx) are not retried.
 */
export function createQueryClient(onUnauthorized: () => void) {
  return new QueryClient({
    queryCache: new QueryCache({
      onError(error) {
        if (error instanceof ApiError && error.status === 401) {
          onUnauthorized();
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        // Metrics come from a paid API, so do not refetch on every focus.
        refetchOnWindowFocus: false,
        retry(failureCount, error) {
          if (error instanceof ApiError && error.status < 500) return false;
          return failureCount < 2;
        },
      },
    },
  });
}
