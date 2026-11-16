"use client";

import {
  FolderOpen,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  Workflow,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { useAuth } from "@/components/auth/AuthGate";
import { useTheme } from "@/components/theme/ThemeProvider";
import Button from "@/components/ui/Button";
import { Kbd } from "@/components/ui/controls";
import type { Route } from "@/lib/route";
import { categories, tools, type ToolCategory } from "@/lib/tools";
import { cn } from "@/lib/utils";

import CommandPalette from "./CommandPalette";

interface AppShellProps {
  route: Route;
  navigate: (route: Route) => void;
  onOpenTool: (id: string) => void;
  children: ReactNode;
}

function NavButton({
  active,
  onClick,
  icon: Icon,
  children,
  sub = false,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  children: ReactNode;
  sub?: boolean;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-ctl px-2.5 text-left font-medium transition-colors",
        sub ? "h-7 pl-9 text-[0.8rem]" : "h-8 text-[0.85rem]",
        active ? "bg-hover text-fg" : "text-fg-muted hover:bg-hover hover:text-fg",
      )}
    >
      {Icon && (
        <Icon
          className={cn("size-4 shrink-0", active && "text-accent")}
          strokeWidth={1.75}
        />
      )}
      <span className="flex-1 truncate">{children}</span>
      {count !== undefined && (
        <span className="font-mono text-[0.72rem] text-fg-subtle">{count}</span>
      )}
    </button>
  );
}

function activeCategory(route: Route): ToolCategory | null {
  if (route.name === "tools") return route.category;

  return null;
}

/** Navigation, search and the page frame. */
export default function AppShell({ route, navigate, onOpenTool, children }: AppShellProps) {
  const { authRequired, signOut } = useAuth();
  const { theme, select } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const category = activeCategory(route);
  const onToolsPage = route.name === "tools";
  const compact = route.name === "studio";
  const fullBleed = compact || route.name === "flows";

  function go(next: Route) {
    setMenuOpen(false);
    navigate(next);
  }

  const sidebar = (
    <div className="flex h-full w-60 flex-col border-r border-line bg-panel">
      <div className="flex h-12 shrink-0 items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-4 rounded-[2px_6px_2px_2px] bg-accent" aria-hidden />
          <span className="text-[0.95rem] font-semibold tracking-tight">PDF Craft</span>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
          className="rounded-ctl p-1.5 text-fg-muted hover:bg-hover lg:hidden"
        >
          <X className="size-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3 pt-1" aria-label="Main">
        <NavButton
          icon={Wrench}
          active={onToolsPage && category === "All tools"}
          onClick={() => go({ name: "tools", category: "All tools" })}
          count={tools.length}
        >
          Tools
        </NavButton>
        {categories
          .filter((item) => item !== "All tools")
          .map((item) => (
            <NavButton
              key={item}
              sub
              active={onToolsPage && category === item}
              onClick={() => go({ name: "tools", category: item })}
              count={tools.filter((tool) => tool.category === item).length}
            >
              {item}
            </NavButton>
          ))}

        <div className="pt-2">
          <NavButton icon={Workflow} active={route.name === "flows"} onClick={() => go({ name: "flows" })}>
            Flows
          </NavButton>
          <NavButton icon={FolderOpen} active={route.name === "files"} onClick={() => go({ name: "files" })}>
            Files
          </NavButton>
          <NavButton icon={Settings} active={route.name === "settings"} onClick={() => go({ name: "settings" })}>
            Settings
          </NavButton>
        </div>
      </nav>

      <div className="shrink-0 space-y-2 border-t border-line p-3">
        <div className="flex items-start gap-2 text-[0.75rem] leading-snug text-fg-muted">
          <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-ok" strokeWidth={1.75} />
          Files stay on this server and are deleted automatically.
        </div>
        {authRequired && (
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-7 w-full items-center gap-2 rounded-ctl px-2 text-[0.8rem] font-medium text-fg-muted hover:bg-hover hover:text-fg"
          >
            <LogOut className="size-3.5" strokeWidth={1.75} />
            Sign out
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-ground text-fg">
      <aside className={compact ? "hidden" : "hidden lg:block"}>{sidebar}</aside>

      {menuOpen && (
        <div className={cn("fixed inset-0 z-40", !compact && "lg:hidden")}>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            className={compact ? "" : "lg:hidden"}
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-4" />
          </Button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 w-full max-w-sm items-center gap-2 rounded-ctl border border-line-strong bg-surface px-2.5 text-left text-[0.85rem] text-fg-subtle hover:border-fg-subtle"
          >
            <Search className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="flex-1 truncate">Find a tool or page</span>
            <Kbd className="hidden sm:inline">Ctrl K</Kbd>
          </button>

          <span className="flex-1" />

          <Button
            variant="ghost"
            size="icon"
            aria-label={`Theme: ${theme.name}. Switch between light and dark`}
            title={theme.name}
            onClick={() => select(theme.mode === "dark" ? "cool-light" : "cool-dark")}
          >
            {theme.mode === "dark" ? (
              <Sun className="size-4" strokeWidth={1.75} />
            ) : (
              <Moon className="size-4" strokeWidth={1.75} />
            )}
          </Button>
        </header>

        <main className={cn("min-h-0 flex-1", fullBleed ? "overflow-hidden" : "overflow-y-auto")}>
          {fullBleed && <h1 className="sr-only">{compact ? "Studio" : "Flows"}</h1>}
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} navigate={navigate} onOpenTool={onOpenTool} />
    </div>
  );
}
