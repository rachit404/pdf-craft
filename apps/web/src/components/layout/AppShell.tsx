"use client";

import {
  FolderOpen,
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
import { tools } from "@/lib/tools";
import { cn } from "@/lib/utils";

import CommandPalette from "./CommandPalette";

interface AppShellProps {
  route: Route;
  navigate: (route: Route) => void;
  onOpenTool: (id: string) => void;
  children: ReactNode;
}

const LINKS: { id: "tools" | "flows" | "files"; label: string; icon: LucideIcon; route: Route }[] = [
  { id: "tools", label: "Tools", icon: Wrench, route: { name: "tools", category: "All tools" } },
  { id: "flows", label: "Flows", icon: Workflow, route: { name: "flows" } },
  { id: "files", label: "Files", icon: FolderOpen, route: { name: "files" } },
];

/** The studio belongs to Files: it is where a file is edited. */
function section(route: Route): string {
  return route.name === "studio" ? "files" : route.name;
}

/** The top bar on every page, and the frame around the page. */
export default function AppShell({ route, navigate, onOpenTool, children }: AppShellProps) {
  const { authRequired, signOut } = useAuth();
  const { theme, select } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const fullBleed = route.name === "studio" || route.name === "flows";
  const current = section(route);

  function go(next: Route) {
    setMenuOpen(false);
    navigate(next);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ground text-fg">
      <a href="#main" className="sr-only z-50 rounded-ctl bg-surface px-3 py-2 text-[0.85rem] font-medium focus:not-sr-only focus:absolute focus:left-3 focus:top-3">
        Skip to the page
      </a>

      <header className="relative z-30 shrink-0 border-b border-line bg-panel/90 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
          <button type="button" onClick={() => go({ name: "tools", category: "All tools" })} className="mr-1 flex items-center gap-2.5 rounded-ctl py-1 pr-2 hover:opacity-90" aria-label="PDF Craft home">
            <span className="h-6 w-[1.15rem] rounded-[3px_8px_3px_3px] bg-gradient-to-br from-accent to-accent-hover shadow-sm" aria-hidden />
            <span className="text-[1rem] font-semibold tracking-tight">PDF Craft</span>
          </button>

          <nav aria-label="Main" className="hidden h-full items-stretch gap-1 md:flex">
            {LINKS.map((link) => {
              const active = current === link.id;

              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => go(link.route)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-2 px-3 text-[0.88rem] font-medium transition-colors",
                    active ? "text-accent" : "text-fg-muted hover:text-fg",
                  )}
                >
                  <link.icon className="size-4" strokeWidth={1.75} />
                  {link.label}
                  {link.id === "tools" && <span className="font-mono text-[0.68rem] text-fg-subtle">{tools.length}</span>}
                  {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" aria-hidden />}
                </button>
              );
            })}
          </nav>

          <span className="flex-1" />

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden h-9 w-64 items-center gap-2 rounded-ctl border border-line-strong bg-surface px-2.5 text-left text-[0.85rem] text-fg-subtle transition-colors hover:border-fg-subtle sm:flex lg:w-80"
          >
            <Search className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="flex-1 truncate">Find a tool or page</span>
            <Kbd>Ctrl K</Kbd>
          </button>
          <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search" onClick={() => setPaletteOpen(true)}>
            <Search className="size-4" strokeWidth={1.75} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label={`Theme: ${theme.name}. Switch between light and dark`}
            title={theme.name}
            onClick={() => select(theme.mode === "dark" ? "aurora" : "cool-dark")}
          >
            {theme.mode === "dark" ? <Sun className="size-4" strokeWidth={1.75} /> : <Moon className="size-4" strokeWidth={1.75} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Settings"
            title="Settings"
            aria-current={route.name === "settings" ? "page" : undefined}
            className={route.name === "settings" ? "bg-accent-soft text-accent" : ""}
            onClick={() => go({ name: "settings" })}
          >
            <Settings className="size-4" strokeWidth={1.75} />
          </Button>
          {authRequired && (
            <Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" onClick={() => void signOut()}>
              <LogOut className="size-4" strokeWidth={1.75} />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="md:hidden" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>

        {menuOpen && (
          <nav aria-label="Menu" className="pc-fade absolute inset-x-0 top-14 border-b border-line bg-panel p-2 shadow-lg md:hidden">
            {LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => go(link.route)}
                aria-current={current === link.id ? "page" : undefined}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-ctl px-3 text-left text-[0.9rem] font-medium",
                  current === link.id ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-hover hover:text-fg",
                )}
              >
                <link.icon className="size-4" strokeWidth={1.75} />
                {link.label}
              </button>
            ))}
            <button type="button" onClick={() => go({ name: "settings" })} className="flex h-10 w-full items-center gap-3 rounded-ctl px-3 text-left text-[0.9rem] font-medium text-fg-muted hover:bg-hover hover:text-fg">
              <Settings className="size-4" strokeWidth={1.75} />
              Settings
            </button>
          </nav>
        )}
      </header>

      <main id="main" tabIndex={-1} className={cn("min-h-0 flex-1 outline-none", fullBleed ? "overflow-hidden" : "overflow-y-auto")}>
        {fullBleed && <h1 className="sr-only">{route.name === "studio" ? "Studio" : "Flows"}</h1>}
        <div key={route.name === "studio" ? `studio:${route.file}` : route.name} className="pc-fade h-full">
          {children}
        </div>
      </main>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} navigate={navigate} onOpenTool={onOpenTool} />
    </div>
  );
}
