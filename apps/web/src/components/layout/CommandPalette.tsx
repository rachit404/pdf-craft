"use client";

import { Command } from "cmdk";
import { useEffect } from "react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/AuthGate";
import { useTheme } from "@/components/theme/ThemeProvider";
import { Kbd } from "@/components/ui/controls";
import type { Route } from "@/lib/route";
import { tools } from "@/lib/tools";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navigate: (route: Route) => void;
  onOpenTool: (id: string) => void;
}

const itemClass =
  "flex cursor-pointer items-center gap-3 rounded-ctl px-2.5 py-2 text-[0.85rem] text-fg data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent";

const headingClass =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[0.7rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle";

/** Ctrl/Cmd+K: jump to any tool or page, or switch theme. */
export default function CommandPalette({
  open,
  onOpenChange,
  navigate,
  onOpenTool,
}: CommandPaletteProps) {
  const { themes, select } = useTheme();
  const { authRequired, signOut } = useAuth();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  function run(action: () => void) {
    onOpenChange(false);
    action();
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      overlayClassName="pc-fade fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
      contentClassName="pc-drop fixed left-1/2 top-[16vh] z-50 w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-box border border-line-strong bg-surface text-fg shadow-xl"
    >
      <div className="flex items-center border-b border-line px-3">
        <Command.Input
          autoFocus
          placeholder="Find a tool, page or theme"
          className="h-11 w-full bg-transparent text-[0.9rem] outline-none placeholder:text-fg-subtle"
        />
        <Kbd>Esc</Kbd>
      </div>

      <Command.List className={`max-h-[22rem] overflow-y-auto p-1.5 ${headingClass}`}>
        <Command.Empty className="px-3 py-6 text-center text-[0.85rem] text-fg-subtle">
          Nothing matches that.
        </Command.Empty>

        <Command.Group heading="Go to">
          <Command.Item className={itemClass} onSelect={() => run(() => navigate({ name: "tools", category: "All tools" }))}>
            All tools
          </Command.Item>
          <Command.Item className={itemClass} onSelect={() => run(() => navigate({ name: "flows" }))}>
            Flows: chain tools together
          </Command.Item>
          <Command.Item className={itemClass} onSelect={() => run(() => navigate({ name: "files" }))}>
            Files
          </Command.Item>
          <Command.Item className={itemClass} onSelect={() => run(() => navigate({ name: "settings" }))}>
            Settings
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Tools">
          {tools.map((tool) => (
            <Command.Item
              key={tool.id}
              value={`${tool.name} ${tool.category} ${tool.description}`}
              className={itemClass}
              onSelect={() => run(() => onOpenTool(tool.id))}
            >
              <tool.icon className="size-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
              <span className="flex-1">{tool.name}</span>
              <span className="text-[0.75rem] text-fg-subtle">{tool.category}</span>
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Theme">
          {themes.map((theme) => (
            <Command.Item
              key={theme.id}
              value={`theme ${theme.name}`}
              className={itemClass}
              onSelect={() =>
                run(() => {
                  select(theme.id);
                  toast(`Theme: ${theme.name}`);
                })
              }
            >
              <span
                className="size-3.5 shrink-0 rounded-full border border-line-strong"
                style={{ background: theme.vars.accent }}
              />
              Use {theme.name}
            </Command.Item>
          ))}
        </Command.Group>

        {authRequired && (
          <Command.Group heading="Account">
            <Command.Item className={itemClass} onSelect={() => run(() => void signOut())}>
              Sign out
            </Command.Item>
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
