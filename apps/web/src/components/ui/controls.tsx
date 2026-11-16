import type { InputHTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "@/lib/utils";

export const fieldStyles =
  "h-8 w-full rounded-ctl border border-line-strong bg-surface px-2.5 text-[0.85rem] text-fg placeholder:text-fg-subtle disabled:opacity-50";

export function Input({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(fieldStyles, className)} {...props} />;
}

/** A keyboard key, for shortcut hints. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "rounded border border-b-2 border-line-strong bg-surface px-1.5 font-mono text-[0.68rem] leading-4 text-fg-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}

/** A row of mutually exclusive choices. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex overflow-hidden rounded-ctl border border-line-strong bg-surface"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          disabled={disabled}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "h-7 flex-1 px-3 text-[0.8rem] font-medium transition-colors disabled:opacity-50",
            value === option.id
              ? "bg-accent-soft text-accent"
              : "text-fg-muted hover:bg-hover hover:text-fg",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
        checked ? "border-accent bg-accent" : "border-line-strong bg-hover",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all",
          checked ? "left-[1.1rem] bg-on-accent" : "left-0.5 bg-fg-subtle",
        )}
      />
    </button>
  );
}

/** A small status label with a coloured dot. */
export function StatusDot({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "danger" | "accent" | "muted";
  children: ReactNode;
}) {
  const dot = {
    ok: "bg-ok",
    warn: "bg-warn",
    danger: "bg-danger",
    accent: "bg-accent",
    muted: "bg-fg-subtle",
  }[tone];

  return (
    <span className="inline-flex items-center gap-1.5 text-[0.8rem]">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {children}
    </span>
  );
}
