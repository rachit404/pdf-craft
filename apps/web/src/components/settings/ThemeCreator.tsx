"use client";

import { Check, Download, RotateCcw, Upload, X } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";

import { useTheme } from "@/components/theme/ThemeProvider";
import Button from "@/components/ui/Button";
import { Input, Segmented } from "@/components/ui/controls";
import { parseHex, toHex } from "@/lib/color";
import {
  BUILT_IN_THEMES,
  checkContrast,
  customTheme,
  DEFAULT_SEED,
  type CustomSeed,
  type Theme,
  type ThemeMode,
} from "@/lib/themes";
import { cn } from "@/lib/utils";

const MAX_CUSTOM_THEMES = 12;

function seedOf(theme: Theme): CustomSeed {
  return (
    theme.seed ?? {
      mode: theme.mode,
      bg: theme.vars.bg,
      surface: theme.vars.surface,
      fg: theme.vars.fg,
      accent: theme.vars.accent,
      radius: parseInt(theme.vars.radius, 10) || 6,
    }
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  // Text is only applied when it is a valid colour and the field is left.
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    const rgb = draft === null ? null : parseHex(draft);

    if (rgb) onChange(toHex(rgb));
    setDraft(null);
  }

  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.8rem] font-medium text-fg-muted">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value.toLowerCase()}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          aria-label={`${label} colour`}
          className="h-8 w-10 shrink-0 cursor-pointer rounded-ctl border border-line-strong bg-surface p-0.5"
        />
        <Input
          value={draft ?? value}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === "Enter" && commit()}
          spellCheck={false}
          maxLength={7}
          aria-label={`${label} hex value`}
          className="font-mono"
        />
      </span>
    </label>
  );
}

function cssVars(vars: Theme["vars"]): CSSProperties {
  return Object.fromEntries(
    Object.entries(vars).map(([name, value]) => [`--${name}`, value]),
  ) as CSSProperties;
}

/** Make a theme from four colours and a corner size. */
export default function ThemeCreator({
  editing,
  onClose,
}: {
  editing: Theme | null;
  onClose: () => void;
}) {
  const { saveCustom, themes } = useTheme();
  const [name, setName] = useState(editing?.name ?? "My theme");
  const [seed, setSeed] = useState<CustomSeed>(editing ? seedOf(editing) : DEFAULT_SEED);
  const importRef = useRef<HTMLInputElement>(null);

  const draft = customTheme(editing?.id ?? "preview", name, seed);
  const checks = checkContrast(draft.vars);
  const failing = checks.filter((check) => !check.pass);
  const customCount = themes.filter((theme) => !theme.builtIn).length;
  const canSave = Boolean(editing) || customCount < MAX_CUSTOM_THEMES;

  function change(patch: Partial<CustomSeed>) {
    setSeed((current) => ({ ...current, ...patch }));
  }

  function startFrom(theme: Theme) {
    setSeed(seedOf(theme));
  }

  function save() {
    const id = editing?.id ?? `custom-${Date.now().toString(36)}`;

    saveCustom(customTheme(id, name, seed));
    toast.success(`Theme "${draft.name}" saved and applied`);
    onClose();
  }

  function exportTheme() {
    const blob = new Blob([JSON.stringify({ name: draft.name, seed }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${draft.name.replace(/[^\w-]+/g, "-").toLowerCase() || "theme"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importTheme(file?: File) {
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      const incoming = data.seed;
      const valid =
        (incoming?.mode === "light" || incoming?.mode === "dark") &&
        ["bg", "surface", "fg", "accent"].every((key) => parseHex(String(incoming[key]))) &&
        Number.isFinite(Number(incoming.radius));

      if (!valid) throw new Error("This is not a PDF Craft theme file.");

      setName(String(data.name ?? "Imported theme").slice(0, 40));
      setSeed({
        mode: incoming.mode,
        bg: toHex(parseHex(incoming.bg)!),
        surface: toHex(parseHex(incoming.surface)!),
        fg: toHex(parseHex(incoming.fg)!),
        accent: toHex(parseHex(incoming.accent)!),
        radius: Math.min(14, Math.max(0, Number(incoming.radius))),
      });
      toast.success("Theme imported. Review it, then save.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that file.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  return (
    <div className="rounded-box border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-[0.9rem] font-semibold">{editing ? "Edit theme" : "New theme"}</h3>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[0.8rem] font-medium text-fg-muted">Name</span>
            <Input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
          </label>

          <div>
            <span className="mb-1.5 block text-[0.8rem] font-medium text-fg-muted">Light or dark</span>
            <Segmented
              label="Mode"
              value={seed.mode}
              onChange={(mode: ThemeMode) => change({ mode })}
              options={[
                { id: "light", label: "Light" },
                { id: "dark", label: "Dark" },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ColorField label="Background" value={seed.bg} onChange={(bg) => change({ bg })} />
            <ColorField label="Cards and fields" value={seed.surface} onChange={(surface) => change({ surface })} />
            <ColorField label="Text" value={seed.fg} onChange={(fg) => change({ fg })} />
            <ColorField label="Accent" value={seed.accent} onChange={(accent) => change({ accent })} />
          </div>

          <label className="block">
            <span className="mb-1.5 flex justify-between text-[0.8rem] font-medium text-fg-muted">
              Corner roundness <span className="font-mono">{seed.radius} px</span>
            </span>
            <input
              type="range"
              min={0}
              max={14}
              value={seed.radius}
              onChange={(event) => change({ radius: Number(event.target.value) })}
              className="w-full accent-[var(--accent)]"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-[0.8rem] font-medium text-fg-muted">Start from</span>
            <div className="flex flex-wrap gap-1.5">
              {BUILT_IN_THEMES.map((theme) => (
                <Button key={theme.id} size="sm" onClick={() => startFrom(theme)}>
                  {theme.name}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setSeed(DEFAULT_SEED)}>
                <RotateCcw className="size-3.5" /> Reset
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div
            style={cssVars(draft.vars)}
            className="overflow-hidden border border-line bg-ground text-fg"
            aria-label="Theme preview"
            role="img"
          >
            <div
              style={{ borderRadius: "var(--radius)" }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2">
                <span className="h-3.5 w-3 rounded-[2px_5px_2px_2px] bg-accent" />
                <span className="text-[0.8rem] font-semibold">PDF Craft</span>
                <span className="ml-auto h-5 w-24 rounded-ctl border border-line-strong bg-surface" />
              </div>
              <div className="space-y-2 p-3">
                <div className="rounded-ctl border border-line bg-surface p-2.5">
                  <p className="text-[0.8rem] font-semibold">contract.pdf</p>
                  <p className="text-[0.72rem] text-fg-muted">8 pages · Watermarked</p>
                  <p className="text-[0.72rem] text-fg-subtle">Removed in 23 h</p>
                </div>
                <div className="rounded-ctl border border-accent bg-accent-soft p-2.5 text-[0.8rem] font-medium text-accent">
                  Selected item
                </div>
                <div className="flex gap-2">
                  <span className="inline-flex h-7 items-center rounded-ctl bg-accent px-3 text-[0.78rem] font-medium text-on-accent">
                    Download
                  </span>
                  <span className="inline-flex h-7 items-center rounded-ctl border border-line-strong bg-surface px-3 text-[0.78rem] font-medium">
                    Cancel
                  </span>
                  <span className="inline-flex h-7 items-center text-[0.78rem] font-medium text-danger">Delete</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-[0.8rem] font-semibold text-fg-muted">Readability</h4>
            <ul className="space-y-1">
              {checks.map((check) => (
                <li key={check.label} className="flex items-center gap-2 text-[0.8rem]">
                  <span
                    className={cn(
                      "inline-flex h-4 w-4 items-center justify-center rounded-full",
                      check.pass ? "bg-ok text-surface" : "bg-danger text-surface",
                    )}
                  >
                    {check.pass ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="flex-1">{check.label}</span>
                  <span className="font-mono text-fg-muted">
                    {check.ratio.toFixed(1)}:1 <span className="text-fg-subtle">(needs {check.needs})</span>
                  </span>
                </li>
              ))}
            </ul>
            {failing.length > 0 && (
              <p className="mt-2 text-[0.78rem] text-warn">
                Some text will be hard to read. Pick colours that differ more in brightness.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <Button variant="primary" disabled={!canSave || !name.trim()} onClick={save}>
          Save and use
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <span className="flex-1" />
        <Button size="sm" onClick={exportTheme}>
          <Download className="size-3.5" /> Export
        </Button>
        <Button size="sm" onClick={() => importRef.current?.click()}>
          <Upload className="size-3.5" /> Import
        </Button>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void importTheme(event.target.files?.[0])}
        />
        {!canSave && (
          <p className="w-full text-[0.78rem] text-warn">
            You can keep up to {MAX_CUSTOM_THEMES} custom themes. Delete one to add another.
          </p>
        )}
      </div>
    </div>
  );
}
