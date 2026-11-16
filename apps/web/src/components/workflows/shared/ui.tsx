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

export const inputClass =
  "h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:opacity-50";

export function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

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
    <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
      <button
        onClick={onBack}
        className="mb-7 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft size={17} />
        Back to tools
      </button>

      <div className="mb-8">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
          <Icon size={23} />
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          {title}
        </h1>

        <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
      </div>

      {children}
    </main>
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
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
        <FileText size={21} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
        <p className="mt-1 text-xs text-gray-500">{detail}</p>
      </div>

      <button
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove file"
        className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
      >
        <X size={18} />
      </button>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
    >
      <X size={18} className="mt-0.5 shrink-0" />
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
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 transition hover:border-violet-200 has-[:checked]:border-violet-300 has-[:checked]:bg-violet-50/40">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-5 text-gray-500">
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
      className={`rounded-xl border p-4 text-sm leading-6 ${
        tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-gray-200 bg-gray-50 text-gray-600"
      }`}
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
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-4 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? (
        <>
          <Loader2 size={18} className="animate-spin" />
          {busyLabel}
        </>
      ) : (
        <>
          <Icon size={18} />
          {label}
        </>
      )}
    </button>
  );
}

interface ResultCardProps {
  title: string;
  detail: string;
  href: string;
  downloadLabel: string;
}

export function ResultCard({
  title,
  detail,
  href,
  downloadLabel,
}: ResultCardProps) {
  return (
    <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <div className="flex items-start gap-3">
        <CheckCircle2 size={23} className="shrink-0 text-emerald-600" />

        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-emerald-900">{title}</h2>
          <p className="mt-2 text-sm text-emerald-800">{detail}</p>

          <a
            href={href}
            download
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            <Download size={17} />
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
  const options = [
    { id: "all", label: "All pages" },
    { id: "current", label: `Page ${page} only` },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          disabled={disabled}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
            value === option.id
              ? "bg-white text-violet-700 shadow-sm"
              : "text-gray-500 hover:text-gray-900"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
