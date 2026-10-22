import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

/**
 * Tidies the address bar: when the page was opened by a longer or older address
 * (a whole id, say) it is replaced, without adding a history entry, by the short
 * one it would have been given. Does nothing until `path` is known.
 */
export function useCanonicalPath(path: string | null) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (path && pathname !== path) navigate(path, { replace: true });
  }, [path, pathname, navigate]);
}
