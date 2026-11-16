/**
 * Colour themes. Every theme is a plain map of design tokens; the app paints
 * itself from CSS variables of the same names (`--bg`, `--fg`, `--accent`...).
 * Built-in themes and user-made themes are applied the same way.
 */

import { contrast, mix, readableOn } from "./color";

export type ThemeMode = "light" | "dark";

export interface ThemeVars {
  bg: string;
  panel: string;
  surface: string;
  line: string;
  "line-strong": string;
  fg: string;
  "fg-muted": string;
  "fg-subtle": string;
  accent: string;
  "accent-hover": string;
  "on-accent": string;
  "accent-soft": string;
  hover: string;
  ok: string;
  warn: string;
  danger: string;
  canvas: string;
  page: string;
  radius: string;
}

/** The four colours and the corner size a user chooses; the rest is derived. */
export interface CustomSeed {
  mode: ThemeMode;
  bg: string;
  surface: string;
  fg: string;
  accent: string;
  radius: number;
}

export interface Theme {
  id: string;
  name: string;
  mode: ThemeMode;
  description: string;
  builtIn: boolean;
  vars: ThemeVars;
  /** Only for custom themes: what the creator edits. */
  seed?: CustomSeed;
}

export const DEFAULT_THEME_ID = "cool-light";
export const STORAGE_KEY = "pdfcraft.theme";

export const BUILT_IN_THEMES: Theme[] = [
  {
    id: "cool-light",
    name: "Cool Light",
    mode: "light",
    description: "Slate greys with a blue accent. The default.",
    builtIn: true,
    vars: {
      bg: "#F4F6F9",
      panel: "#FAFBFD",
      surface: "#FFFFFF",
      line: "#E1E6ED",
      "line-strong": "#C7D0DC",
      fg: "#131A24",
      "fg-muted": "#475467",
      "fg-subtle": "#5B6779",
      accent: "#2563EB",
      "accent-hover": "#1D4ED8",
      "on-accent": "#FFFFFF",
      "accent-soft": "#E6EEFD",
      hover: "#ECEFF4",
      ok: "#17734A",
      warn: "#9A5B06",
      danger: "#B3261E",
      canvas: "#E8ECF2",
      page: "#FFFFFF",
      radius: "6px",
    },
  },
  {
    id: "cool-dark",
    name: "Cool Dark",
    mode: "dark",
    description: "Deep slate with a soft blue accent.",
    builtIn: true,
    vars: {
      bg: "#0E1217",
      panel: "#12171D",
      surface: "#171D25",
      line: "#252D38",
      "line-strong": "#364150",
      fg: "#E7ECF3",
      "fg-muted": "#AAB5C4",
      "fg-subtle": "#8A97A9",
      accent: "#5B9BFF",
      "accent-hover": "#86B6FF",
      "on-accent": "#08111F",
      "accent-soft": "#14233A",
      hover: "#1D2530",
      ok: "#4FC38A",
      warn: "#E0A64A",
      danger: "#F28B82",
      canvas: "#0A0D11",
      page: "#F2F5F9",
      radius: "6px",
    },
  },
  {
    id: "warm-paper",
    name: "Warm Paper",
    mode: "light",
    description: "Warm greys with an orange accent, like paper and ink.",
    builtIn: true,
    vars: {
      bg: "#F7F6F4",
      panel: "#FBFAF8",
      surface: "#FFFFFF",
      line: "#E4E1DC",
      "line-strong": "#CFCAC2",
      fg: "#1C1B19",
      "fg-muted": "#5E5A54",
      "fg-subtle": "#6F6A63",
      accent: "#C2410C",
      "accent-hover": "#9A3412",
      "on-accent": "#FFFFFF",
      "accent-soft": "#FBEDE5",
      hover: "#EFEDE9",
      ok: "#1F7A4D",
      warn: "#B45309",
      danger: "#B42318",
      canvas: "#ECE9E4",
      page: "#FFFFFF",
      radius: "5px",
    },
  },
];

const STATUS_COLOURS: Record<ThemeMode, Pick<ThemeVars, "ok" | "warn" | "danger">> = {
  light: { ok: "#17734A", warn: "#9A5B06", danger: "#B3261E" },
  dark: { ok: "#4FC38A", warn: "#E0A64A", danger: "#F28B82" },
};

export const DEFAULT_SEED: CustomSeed = {
  mode: "light",
  bg: "#F4F6F9",
  surface: "#FFFFFF",
  fg: "#131A24",
  accent: "#0F766E",
  radius: 6,
};

/** Fill in every token from the four colours a user picks. */
export function deriveVars(seed: CustomSeed): ThemeVars {
  const { bg, surface, fg, accent, mode } = seed;

  return {
    bg,
    surface,
    fg,
    accent,
    panel: mix(surface, bg, 0.5),
    line: mix(fg, bg, 0.13),
    "line-strong": mix(fg, bg, 0.26),
    "fg-muted": mix(fg, bg, 0.76),
    "fg-subtle": mix(fg, bg, 0.64),
    hover: mix(fg, bg, 0.07),
    "accent-hover": mode === "dark" ? mix(accent, "#FFFFFF", 0.8) : mix(accent, "#000000", 0.82),
    "on-accent": readableOn(accent),
    "accent-soft": mix(accent, bg, 0.14),
    canvas: mix(fg, bg, 0.06),
    page: mode === "dark" ? "#F2F5F9" : "#FFFFFF",
    radius: `${Math.round(seed.radius)}px`,
    ...STATUS_COLOURS[mode],
  };
}

export function customTheme(id: string, name: string, seed: CustomSeed): Theme {
  return {
    id,
    name: name.trim() || "My theme",
    mode: seed.mode,
    description: "Custom theme",
    builtIn: false,
    vars: deriveVars(seed),
    seed,
  };
}

export interface ContrastCheck {
  label: string;
  ratio: number;
  /** Ratio needed to pass. */
  needs: number;
  pass: boolean;
}

/** Readability of the pairs that matter, against WCAG AA. */
export function checkContrast(vars: ThemeVars): ContrastCheck[] {
  const pairs: [string, string, string, number][] = [
    ["Text on background", vars.fg, vars.bg, 4.5],
    ["Text on cards", vars.fg, vars.surface, 4.5],
    ["Secondary text", vars["fg-muted"], vars.bg, 4.5],
    ["Hints and labels", vars["fg-subtle"], vars.bg, 4.5],
    ["Button text", vars["on-accent"], vars.accent, 4.5],
    ["Accent on background", vars.accent, vars.bg, 3],
  ];

  return pairs.map(([label, first, second, needs]) => {
    const ratio = contrast(first, second);

    return { label, ratio, needs, pass: ratio >= needs };
  });
}

// ---------------------------------------------------------
// Saved choice
// ---------------------------------------------------------

export interface StoredTheme {
  /** Id of the chosen theme (ignored while `system` is on). */
  id: string;
  /** Follow the operating system: Cool Light by day, Cool Dark at night. */
  system: boolean;
  custom: Theme[];
}

export const EMPTY_STORED: StoredTheme = { id: DEFAULT_THEME_ID, system: false, custom: [] };

export function allThemes(stored: StoredTheme): Theme[] {
  return [...BUILT_IN_THEMES, ...stored.custom];
}

export function resolveTheme(stored: StoredTheme, systemPrefersDark: boolean): Theme {
  const themes = allThemes(stored);
  const wanted = stored.system
    ? systemPrefersDark
      ? "cool-dark"
      : "cool-light"
    : stored.id;

  return themes.find((theme) => theme.id === wanted) ?? BUILT_IN_THEMES[0];
}

/** Tolerant reader: anything unexpected falls back to the defaults. */
export function parseStored(raw: string | null): StoredTheme {
  try {
    const data = JSON.parse(raw ?? "null");

    if (!data || typeof data !== "object") return EMPTY_STORED;

    const custom = Array.isArray(data.custom)
      ? (data.custom as Theme[]).filter(
          (theme) =>
            typeof theme?.id === "string" &&
            theme.seed &&
            typeof theme.vars?.bg === "string",
        )
      : [];

    return {
      id: typeof data.id === "string" ? data.id : DEFAULT_THEME_ID,
      system: data.system === true,
      custom: custom.slice(0, 12),
    };
  } catch {
    return EMPTY_STORED;
  }
}

/** Paint a theme onto the page. Safe to call repeatedly. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(theme.vars)) {
    root.style.setProperty(`--${name}`, value);
  }

  root.dataset.theme = theme.id;
  root.dataset.mode = theme.mode;
  root.style.colorScheme = theme.mode;
}

/**
 * Runs in the page head before anything is drawn, so the chosen theme shows
 * from the first paint with no flash. Kept dependency-free on purpose.
 */
export function themeInitScript(): string {
  const builtIn = Object.fromEntries(
    BUILT_IN_THEMES.map((theme) => [theme.id, { mode: theme.mode, vars: theme.vars }]),
  );

  return `(function(){try{
var B=${JSON.stringify(builtIn)};
var s=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||"null")||{};
var dark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;
var id=s.system?(dark?"cool-dark":"cool-light"):(s.id||"cool-light");
var t=B[id];
if(!t&&Array.isArray(s.custom)){for(var i=0;i<s.custom.length;i++){if(s.custom[i]&&s.custom[i].id===id){t=s.custom[i];}}}
if(!t){id="cool-light";t=B[id];}
var r=document.documentElement;
for(var k in t.vars){r.style.setProperty("--"+k,t.vars[k]);}
r.dataset.theme=id;r.dataset.mode=t.mode;r.style.colorScheme=t.mode;
}catch(e){}})();`;
}
