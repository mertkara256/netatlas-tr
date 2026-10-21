import { useSyncExternalStore } from "react";
import type { Theme } from "./colors";

const query = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** The reader's light/dark setting; the prerendered HTML assumes light. */
export function useColorScheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(query).matches ? "dark" : "light"),
    () => "light",
  );
}
