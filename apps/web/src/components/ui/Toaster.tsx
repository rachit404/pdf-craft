"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";

/** Notifications painted with the active theme. */
export default function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--fg)",
          "--normal-border": "var(--line-strong)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
    />
  );
}
