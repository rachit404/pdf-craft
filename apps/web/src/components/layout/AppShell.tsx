"use client";

import {
  FolderOpen,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
  Workflow,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { useTheme } from "@/components/theme/ThemeProvider";
import Button from "@/components/ui/Button";
import { Kbd } from "@/components/ui/controls";
import Logo from "@/components/ui/Logo";
import type { Route } from "@/lib/route";
import { usePersistedFlag } from "@/lib/usePersistedFlag";
import { cn } from "@/lib/utils";

import CommandPalette from "./CommandPalette";
import { SidebarProvider } from "./SidebarSlot";

interface AppShellProps {
  route: Route;
  navigate: (route: Route) => void;
  onOpenTool: (id: string) => void;
  children: ReactNode;
}

const SECTIONS: { id: "tools" | "flows" | "files"; label: string; icon: LucideIcon; route: Route }[] = [
  { id: "tools", label: "Tools", icon: Wrench, route: { name: "tools", category: "All tools" } },
  { id: "flows", label: "Flows", icon: Workflow, route: { name: "flows" } },
  { id: "files", label: "Files", icon: FolderOpen, route: { name: "files" } },
];

/** The Studio belongs to Files: it is where a file is edited. */
function sectionOf(route: Route): string {
  return route.name === "studio" ? "files" : route.name;
}

/**
 * The frame around every page: a bar along the top (logo, search, theme, settings) and
 * one sidebar down the left. Open, it shows icons with their names and the page's own
 * list (tool categories, flow steps). Closed, it shrinks to a slim column of icons.
 */
export default function AppShell({ route, navigate, onOpenTool, children }: AppShellProps) {
  const { theme, select } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [expanded, setExpanded] = usePersistedFlag("pdfcraft.sidebar");
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  const fullBleed = route.name === "studio" || route.name === "flows";
  const current = sectionOf(route);
  const toggleLabel = expanded ? "Hide sidebar" : "Show sidebar";

  function go(next: Route) {
    setMenuOpen(false);
    navigate(next);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ground text-fg">
      <a href="#main" className="sr-only z-50 rounded-ctl bg-surface px-3 py-2 text-[0.85rem] font-medium focus:not-sr-only focus:absolute focus:left-3 focus:top-3">
        Skip to the page
      </a>

      <header className="sticky top-0 z-40 shrink-0 border-b border-line bg-panel/95 backdrop-blur">
        <div className="flex h-14 items-stretch">
          {/* The logo cell is as wide as the sidebar under it, so the two read as one column. */}
          <button
            type="button"
            onClick={() => go({ name: "tools", category: "All tools" })}
            aria-label="PDF Craft home"
            title="PDF Craft"
            className={cn(
              "hidden shrink-0 items-center gap-2.5 overflow-hidden border-r border-line px-3 transition-[width,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-90 md:flex",
              expanded ? "w-60 bg-panel" : "w-14 bg-hover",
            )}
          >
            <Logo className="size-8" />
            <span className={cn("whitespace-nowrap text-[1rem] font-semibold tracking-tight transition-opacity duration-200", expanded ? "opacity-100" : "opacity-0")}>PDF Craft</span>
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2 px-3 sm:px-4">
            <button type="button" onClick={() => go({ name: "tools", category: "All tools" })} className="flex items-center gap-2.5 rounded-ctl py-1 pr-2 md:hidden" aria-label="PDF Craft home">
              <Logo className="size-8" />
              <span className="text-[1rem] font-semibold tracking-tight">PDF Craft</span>
            </button>

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
            <Button variant="ghost" size="icon" className="md:hidden" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
              {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </Button>
          </div>
        </div>

        {/* On small screens there is no room for the sidebar, so the same choices drop down from the bar. */}
        {menuOpen && (
          <nav aria-label="Menu" className="pc-fade absolute inset-x-0 top-14 border-b border-line bg-panel p-2 shadow-lg md:hidden">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => go(section.route)}
                aria-current={current === section.id ? "page" : undefined}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-ctl px-3 text-left text-[0.9rem] font-medium",
                  current === section.id ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-hover hover:text-fg",
                )}
              >
                <section.icon className="size-4" strokeWidth={1.75} />
                {section.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Sidebar"
          className={cn(
            "hidden shrink-0 overflow-hidden border-r border-line transition-[width,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:block",
            expanded ? "w-60 bg-panel" : "w-14 bg-hover",
          )}
        >
          {/* Fixed width inside, so the contents do not rewrap while the sidebar slides. */}
          <div className="flex h-full w-60 flex-col">
            <nav aria-label="Main" className="space-y-1 px-2 pt-2">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                aria-label={toggleLabel}
                aria-expanded={expanded}
                title={toggleLabel}
                className="flex h-10 w-10 items-center gap-3 overflow-hidden rounded-ctl px-2.5 text-left text-[0.88rem] font-medium text-fg-muted transition-[width,background-color,color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-hover hover:text-fg active:scale-[0.98] data-[open=true]:w-full"
                data-open={expanded}
              >
                {expanded ? <PanelLeftClose className="size-5 shrink-0" strokeWidth={1.75} /> : <PanelLeftOpen className="size-5 shrink-0" strokeWidth={1.75} />}
                <span className={cn("whitespace-nowrap transition-opacity duration-200", expanded ? "opacity-100" : "opacity-0")}>Hide sidebar</span>
              </button>

              <span className="mx-2.5 my-1 block h-px bg-line-strong/60" aria-hidden />

              {SECTIONS.map((section) => {
                const active = current === section.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => go(section.route)}
                    aria-label={section.label}
                    aria-current={active ? "page" : undefined}
                    title={section.label}
                    className={cn(
                      "group relative flex h-10 items-center gap-3 overflow-hidden rounded-ctl px-2.5 text-left text-[0.9rem] font-medium transition-[width,background-color,color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]",
                      expanded ? "w-full" : "w-10",
                      active ? "bg-accent-soft font-semibold text-accent" : "text-fg-muted hover:bg-hover hover:text-fg",
                    )}
                  >
                    <section.icon className="size-5 shrink-0" strokeWidth={1.75} />
                    <span className={cn("whitespace-nowrap transition-opacity duration-200", expanded ? "opacity-100" : "opacity-0")}>{section.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Each page may show its own list here (tool categories, flow steps) while the sidebar is open. */}
            <div
              ref={setSlot}
              className={cn("mt-3 min-h-0 flex-1 overflow-y-auto border-t border-line px-2 pb-4 pt-3 transition-opacity duration-200", expanded ? "opacity-100" : "pointer-events-none opacity-0")}
              inert={!expanded}
            />
          </div>
        </aside>

        <main id="main" tabIndex={-1} className={cn("min-h-0 min-w-0 flex-1 outline-none", fullBleed ? "overflow-hidden" : "overflow-y-auto")}>
          {fullBleed && <h1 className="sr-only">{route.name === "studio" ? "Studio" : "Flows"}</h1>}
          <SidebarProvider value={{ slot, expanded }}>
            <div key={route.name === "studio" ? `studio:${route.file}` : route.name} className="pc-fade h-full">
              {children}
            </div>
          </SidebarProvider>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} navigate={navigate} onOpenTool={onOpenTool} />
    </div>
  );
}
