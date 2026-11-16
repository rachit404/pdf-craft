"use client";

import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/AuthGate";
import { useTheme } from "@/components/theme/ThemeProvider";
import Button from "@/components/ui/Button";
import { Switch } from "@/components/ui/controls";
import type { Theme } from "@/lib/themes";
import { cn } from "@/lib/utils";

import ThemeCreator from "./ThemeCreator";

function Swatches({ theme }: { theme: Theme }) {
  const { vars } = theme;

  return (
    <div
      className="flex h-14 overflow-hidden border border-line-strong"
      style={{ background: vars.bg, borderRadius: vars.radius }}
      aria-hidden
    >
      <div className="w-1/4 border-r" style={{ background: vars.panel, borderColor: vars.line }} />
      <div className="flex flex-1 flex-col justify-center gap-1.5 px-2.5">
        <div className="h-2 w-2/3 rounded-sm" style={{ background: vars.fg }} />
        <div className="h-1.5 w-1/2 rounded-sm" style={{ background: vars["fg-subtle"] }} />
        <div className="flex gap-1">
          <div className="h-3 w-8 rounded-sm" style={{ background: vars.accent }} />
          <div className="h-3 w-5 rounded-sm border" style={{ background: vars.surface, borderColor: vars["line-strong"] }} />
        </div>
      </div>
    </div>
  );
}

function ThemeCard({
  theme,
  active,
  onSelect,
  onEdit,
  onDelete,
}: {
  theme: Theme;
  active: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-box border bg-surface p-3 transition-colors",
        active ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong",
      )}
    >
      <button type="button" onClick={onSelect} aria-pressed={active} className="block w-full text-left">
        <Swatches theme={theme} />
        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-[0.88rem] font-semibold">{theme.name}</span>
          <span className="rounded-full border border-line-strong px-1.5 text-[0.68rem] capitalize text-fg-muted">
            {theme.mode}
          </span>
          {active && <Check className="ml-auto size-4 text-accent" strokeWidth={2.25} aria-label="In use" />}
        </div>
        <p className="mt-0.5 text-[0.78rem] text-fg-subtle">{theme.description}</p>
      </button>

      {onEdit && onDelete && (
        <div className="mt-2 flex gap-1 border-t border-line pt-2">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil className="size-3.5" /> Edit
          </Button>
          <Button size="sm" variant="ghost" className="text-danger" onClick={onDelete}>
            <Trash2 className="size-3.5" /> Delete
          </Button>
        </div>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-6 first:border-t-0 first:pt-0">
      <h2 className="text-[0.95rem] font-semibold">{title}</h2>
      {hint && <p className="mb-4 mt-0.5 text-[0.85rem] text-fg-muted">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

export default function SettingsPage({ onOpenFiles }: { onOpenFiles: () => void }) {
  const { theme, themes, select, followSystem, setFollowSystem, removeCustom } = useTheme();
  const { authRequired, signOut } = useAuth();
  const [creator, setCreator] = useState<{ editing: Theme | null } | null>(null);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-6 sm:px-8">
      <h1 className="mb-6 text-lg font-semibold tracking-tight">Settings</h1>

      <Section title="Appearance" hint="Pick a theme. Your choice is saved in this browser.">
        <div className="mb-4 flex items-center justify-between gap-4 rounded-box border border-line bg-surface px-4 py-3">
          <div>
            <p className="text-[0.88rem] font-medium">Match my system</p>
            <p className="text-[0.8rem] text-fg-subtle">Use Cool Light by day and Cool Dark at night, following your device.</p>
          </div>
          <Switch label="Match my system" checked={followSystem} onChange={setFollowSystem} />
        </div>

        <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", followSystem && "opacity-60")}>
          {themes.map((item) => (
            <ThemeCard
              key={item.id}
              theme={item}
              active={!followSystem && item.id === theme.id}
              onSelect={() => select(item.id)}
              onEdit={item.builtIn ? undefined : () => setCreator({ editing: item })}
              onDelete={
                item.builtIn
                  ? undefined
                  : () => {
                      removeCustom(item.id);
                      toast(`Deleted "${item.name}"`);
                    }
              }
            />
          ))}

          {!creator && (
            <button
              type="button"
              onClick={() => setCreator({ editing: null })}
              className="flex min-h-36 flex-col items-center justify-center gap-1.5 rounded-box border border-dashed border-line-strong bg-surface text-fg-muted transition-colors hover:border-accent hover:text-accent"
            >
              <Plus className="size-5" strokeWidth={1.75} />
              <span className="text-[0.85rem] font-medium">Create your own theme</span>
            </button>
          )}
        </div>

        {creator && (
          <div className="mt-4">
            <ThemeCreator key={creator.editing?.id ?? "new"} editing={creator.editing} onClose={() => setCreator(null)} />
          </div>
        )}
      </Section>

      <Section title="Your files" hint="Uploads and results stay on this server only and are removed automatically.">
        <Button onClick={onOpenFiles}>See stored files</Button>
      </Section>

      {authRequired && (
        <Section title="Account">
          <Button onClick={() => void signOut()}>Sign out</Button>
        </Section>
      )}
    </div>
  );
}
