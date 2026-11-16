import type { ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  X,
  type LucideIcon,
} from "lucide-react";

import Button, { buttonStyles } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/controls";
import { cn } from "@/lib/utils";

export { formatSize } from "@/lib/format";

export const inputClass =
  "h-9 w-full rounded-ctl border border-line-strong bg-surface px-3 text-[0.88rem] text-fg placeholder:text-fg-subtle disabled:opacity-50";

interface WorkflowShellProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onBack: () => void;
  children: ReactNode;
}

export function WorkflowShell({
  icon: Icon,
  title,
  description,
  onBack,
  children,
}: WorkflowShellProps) {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-[0.85rem] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" strokeWidth={1.75} />
        All tools
      </button>

      <div className="mb-6 flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-ctl bg-accent-soft text-accent">
          <Icon className="size-[1.15rem]" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="mt-0.5 max-w-2xl text-[0.85rem] leading-relaxed text-fg-muted">
            {description}
          </p>
        </div>
      </div>

      {children}
    </div>
  );
}

interface FileChipProps {
  name: string;
  detail: string;
  disabled?: boolean;
  onRemove: () => void;
}

export function FileChip({ name, detail, disabled, onRemove }: FileChipProps) {
  return (
    <div className="flex items-center gap-3 rounded-box border border-line bg-surface p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-ctl bg-hover text-fg-muted">
        <FileText className="size-[1.1rem]" strokeWidth={1.75} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.88rem] font-medium">{name}</p>
        <p className="text-[0.78rem] text-fg-subtle">{detail}</p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove file"
      >
        <X className="size-4" strokeWidth={1.75} />
      </Button>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="mt-5 flex items-start gap-2.5 rounded-box border border-danger/40 bg-danger/10 p-3 text-[0.85rem] text-danger"
    >
      <X className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
      <span>{message}</span>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/** Labelled checkbox row for yes/no options. */
export function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: ToggleRowProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-ctl border bg-surface p-3 transition-colors hover:border-line-strong",
        checked ? "border-accent/60 bg-accent-soft/50" : "border-line",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="block text-[0.85rem] font-medium">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[0.78rem] leading-snug text-fg-subtle">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

/** Informational or cautionary note shown above an action. */
export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-box border p-3.5 text-[0.85rem] leading-relaxed",
        tone === "warning"
          ? "border-warn/40 bg-warn/10 text-fg"
          : "border-line bg-panel text-fg-muted",
      )}
    >
      {children}
    </div>
  );
}

interface SubmitButtonProps {
  label: string;
  busyLabel: string;
  icon: LucideIcon;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function SubmitButton({
  label,
  busyLabel,
  icon: Icon,
  busy,
  disabled,
  onClick,
}: SubmitButtonProps) {
  return (
    <Button
      variant="primary"
      size="lg"
      className="w-full"
      onClick={onClick}
      disabled={busy || disabled}
    >
      {busy ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {busyLabel}
        </>
      ) : (
        <>
          <Icon className="size-4" strokeWidth={1.75} />
          {label}
        </>
      )}
    </Button>
  );
}

interface ResultCardProps {
  title: string;
  detail: string;
  href: string;
  downloadLabel: string;
}

export function ResultCard({ title, detail, href, downloadLabel }: ResultCardProps) {
  return (
    <section className="mt-6 rounded-box border border-ok/40 bg-ok/10 p-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" strokeWidth={1.75} />

        <div className="min-w-0 flex-1">
          <h2 className="text-[0.92rem] font-semibold">{title}</h2>
          <p className="mt-1 text-[0.85rem] text-fg-muted">{detail}</p>

          <a href={href} download className={cn(buttonStyles({ variant: "primary", size: "lg" }), "mt-4")}>
            <Download className="size-4" strokeWidth={1.75} />
            {downloadLabel}
          </a>
        </div>
      </div>
    </section>
  );
}

interface ScopeToggleProps {
  value: "all" | "current";
  page: number;
  disabled?: boolean;
  onChange: (value: "all" | "current") => void;
}

/** Choose between applying an edit to every page or only the previewed one. */
export function ScopeToggle({ value, page, disabled, onChange }: ScopeToggleProps) {
  return (
    <Segmented
      label="Apply to"
      value={value}
      disabled={disabled}
      onChange={onChange}
      options={[
        { id: "all", label: "All pages" },
        { id: "current", label: `Page ${page} only` },
      ]}
    />
  );
}
