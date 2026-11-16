"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  allThemes,
  applyTheme,
  EMPTY_STORED,
  parseStored,
  resolveTheme,
  STORAGE_KEY,
  type StoredTheme,
  type Theme,
} from "@/lib/themes";

interface ThemeContextValue {
  /** The theme currently painted. */
  theme: Theme;
  themes: Theme[];
  followSystem: boolean;
  select: (id: string) => void;
  setFollowSystem: (follow: boolean) => void;
  saveCustom: (theme: Theme) => void;
  removeCustom: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);

  if (!value) throw new Error("useTheme must be used inside ThemeProvider.");

  return value;
}

function readStored(): StoredTheme {
  try {
    return parseStored(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return EMPTY_STORED;
  }
}

/** Keeps the chosen theme (and the user's custom themes) in this browser. */
export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredTheme>(() =>
    typeof window === "undefined" ? EMPTY_STORED : readStored(),
  );
  const [prefersDark, setPrefersDark] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setPrefersDark(query.matches);

    query.addEventListener("change", update);

    return () => query.removeEventListener("change", update);
  }, []);

  const theme = useMemo(() => resolveTheme(stored, prefersDark), [stored, prefersDark]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const commit = useCallback((next: StoredTheme) => {
    setStored(next);

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode: the choice lasts until the tab closes.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themes: allThemes(stored),
      followSystem: stored.system,
      select: (id) => commit({ ...stored, id, system: false }),
      setFollowSystem: (system) => commit({ ...stored, system }),
      saveCustom: (custom) =>
        commit({
          ...stored,
          id: custom.id,
          system: false,
          custom: [...stored.custom.filter((item) => item.id !== custom.id), custom],
        }),
      removeCustom: (id) =>
        commit({
          ...stored,
          id: stored.id === id ? EMPTY_STORED.id : stored.id,
          custom: stored.custom.filter((item) => item.id !== id),
        }),
    }),
    [theme, stored, commit],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
