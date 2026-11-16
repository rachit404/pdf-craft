"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "pdfcraft:flag";

/**
 * An on/off choice remembered in this browser, such as whether a sidebar is open.
 * Until a choice is made it is on for wide screens and off for narrow ones.
 */
export function usePersistedFlag(key: string): [boolean, (value: boolean) => void] {
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("storage", notify);
    window.addEventListener(EVENT, notify);
    // Before a choice is made the default follows the window width.
    window.addEventListener("resize", notify);

    return () => {
      window.removeEventListener("storage", notify);
      window.removeEventListener(EVENT, notify);
      window.removeEventListener("resize", notify);
    };
  }, []);

  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        const stored = window.localStorage.getItem(key);

        return stored === null ? window.innerWidth >= 1024 : stored === "1";
      } catch {
        return window.innerWidth >= 1024;
      }
    },
    () => true,
  );

  const set = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Storage may be blocked; the choice then lasts until the page is reloaded.
      }

      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return [value, set];
}
