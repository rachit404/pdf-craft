"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface SidebarValue {
  /** Where a page may put its own list (categories, steps) inside the sidebar. */
  slot: HTMLElement | null;
  /** True when the sidebar is open, so a page knows its list is already on screen. */
  expanded: boolean;
}

const SidebarContext = createContext<SidebarValue>({ slot: null, expanded: false });

export const SidebarProvider = SidebarContext.Provider;

export function useSidebar(): SidebarValue {
  return useContext(SidebarContext);
}

/** A page's own list, shown inside the sidebar while it is open. */
export function SidebarPortal({ title, children }: { title: string; children: ReactNode }) {
  const { slot } = useSidebar();

  if (!slot) return null;

  return createPortal(
    <section aria-label={title}>
      <p className="px-2 pb-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-fg-subtle">{title}</p>
      {children}
    </section>,
    slot,
  );
}
