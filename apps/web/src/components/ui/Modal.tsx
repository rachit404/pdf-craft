"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Buttons along the bottom edge. */
  footer?: ReactNode;
  /** Width of the dialog. */
  size?: "md" | "lg" | "xl";
}

const WIDTHS = { md: "max-w-lg", lg: "max-w-3xl", xl: "max-w-6xl" };

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** A dialog over the page: Escape or a click outside closes it, and Tab stays inside it. */
export default function Modal({ open, onClose, title, description, children, footer, size = "lg" }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    const scroll = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    // Start on the dialog itself, so screen readers read its title first.
    panel.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();

        return;
      }

      if (event.key !== "Tab" || !panel.current) return;

      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null);

      if (items.length === 0) {
        event.preventDefault();

        return;
      }

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey, true);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = scroll;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="pc-fade absolute inset-0 cursor-default bg-black/50 backdrop-blur-[2px]" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "pc-pop relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-box border border-line-strong bg-surface text-fg shadow-2xl outline-none",
          WIDTHS[size],
        )}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[1rem] font-semibold tracking-tight">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-[0.82rem] text-fg-muted">
                {description}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-ctl p-1.5 text-fg-muted hover:bg-hover hover:text-fg">
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer && <div className="flex flex-wrap items-center gap-2 border-t border-line bg-panel px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
