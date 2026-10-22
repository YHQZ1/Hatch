import { useState } from "react";
import type { ViewMode } from "./Toolbar";

/** The grid/list choice of a page, remembered in this browser under `key`. */
export function useStoredView(key: string): [ViewMode, (mode: ViewMode) => void] {
  const [view, setViewState] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(key) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  const setView = (mode: ViewMode) => {
    setViewState(mode);
    try {
      localStorage.setItem(key, mode);
    } catch {
      // The choice only lasts for this visit.
    }
  };
  return [view, setView];
}
