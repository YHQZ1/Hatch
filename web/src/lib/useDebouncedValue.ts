import { useEffect, useState } from "react";

/** The value, but only after it has stopped changing for waitMs. */
export function useDebouncedValue<T>(value: T, waitMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), waitMs);
    return () => window.clearTimeout(timeout);
  }, [value, waitMs]);

  return debounced;
}
