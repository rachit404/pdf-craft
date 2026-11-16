"use client";

import { useEffect, useState } from "react";

import PasswordInput from "@/components/ui/PasswordInput";
import { Input } from "@/components/ui/controls";
import { getRegistry, type JsonSchemaField, type OperationSpec } from "@/lib/api";
import { formatPages, parsePages } from "@/lib/pages";

export type Settings = Record<string, unknown>;

/** Per-field adjustments the schema alone cannot express. */
export interface FieldHint {
  label?: string;
  help?: string;
  hidden?: boolean;
  options?: { value: string; label: string }[];
}

interface SchemaFormProps {
  operation: string;
  value: Settings;
  onChange: (value: Settings) => void;
  pageCount: number;
  hints?: Record<string, FieldHint>;
  disabled?: boolean;
}

/** The real type of a field: `anyOf: [X, null]` means an optional X. */
function resolve(field: JsonSchemaField): JsonSchemaField {
  const inner = field.anyOf?.find((item) => item.type !== "null");

  return inner ? { ...inner, title: field.title, default: field.default } : field;
}

function humanise(name: string): string {
  const text = name.replace(/_/g, " ");

  return text.charAt(0).toUpperCase() + text.slice(1);
}

const labelClass = "mb-1.5 block text-[0.8rem] font-medium text-fg-muted";

function PagesField({
  label,
  value,
  pageCount,
  onChange,
  disabled,
}: {
  label: string;
  value: number[] | undefined;
  pageCount: number;
  onChange: (pages: number[] | undefined) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value ? formatPages(value) : "");
  const problem = text.trim() ? parsePages(text, pageCount) : null;

  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <Input
        value={text}
        disabled={disabled}
        placeholder={`All pages, or e.g. 1-3, 5 (1 to ${pageCount})`}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = event.target.value.trim()
            ? parsePages(event.target.value, pageCount)
            : undefined;

          onChange(Array.isArray(parsed) ? parsed : undefined);
        }}
      />
      {typeof problem === "string" && <span className="mt-1 block text-[0.75rem] text-danger">{problem}</span>}
    </label>
  );
}

/** A settings form built from an operation's JSON Schema in the registry. */
export default function SchemaForm({
  operation,
  value,
  onChange,
  pageCount,
  hints = {},
  disabled,
}: SchemaFormProps) {
  const [spec, setSpec] = useState<OperationSpec | null>(null);

  useEffect(() => {
    let cancelled = false;

    getRegistry()
      .then((all) => {
        if (!cancelled) setSpec(all.find((item) => item.id === operation) ?? null);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [operation]);

  if (!spec) return null;

  const fields = Object.entries(spec.params_schema.properties ?? {});
  const set = (name: string, next: unknown) => onChange({ ...value, [name]: next });

  return (
    <div className="space-y-3.5">
      {fields.map(([name, raw]) => {
        const hint = hints[name] ?? {};

        if (hint.hidden) return null;

        const field = resolve(raw);
        const label = hint.label ?? field.title ?? humanise(name);
        const current = value[name] ?? field.default;
        const help = hint.help && (
          <span className="mt-1 block text-[0.75rem] text-fg-subtle">{hint.help}</span>
        );

        if (hint.options || field.enum) {
          const options = hint.options ?? field.enum!.map((item) => ({ value: item, label: humanise(item) }));

          return (
            <label key={name} className="block">
              <span className={labelClass}>{label}</span>
              <select
                disabled={disabled}
                value={String(current ?? options[0].value)}
                onChange={(event) => set(name, event.target.value)}
                className="h-8 w-full rounded-ctl border border-line-strong bg-surface px-2 text-[0.85rem]"
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {help}
            </label>
          );
        }

        if (field.type === "boolean") {
          return (
            <label key={name} className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                disabled={disabled}
                checked={Boolean(current)}
                onChange={(event) => set(name, event.target.checked)}
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-[0.85rem] font-medium">{label}</span>
                {help}
              </span>
            </label>
          );
        }

        if (field.type === "integer" || field.type === "number") {
          const min = field.minimum ?? (field.exclusiveMinimum !== undefined ? field.exclusiveMinimum : undefined);
          const range = field.minimum !== undefined && field.maximum !== undefined && field.maximum <= 200;

          return (
            <label key={name} className="block">
              <span className={`${labelClass} flex justify-between`}>
                {label}
                <span className="font-mono">{String(current ?? "")}</span>
              </span>
              {range ? (
                <input
                  type="range"
                  disabled={disabled}
                  min={field.minimum}
                  max={field.maximum}
                  step={field.type === "integer" ? 1 : (field.maximum! - field.minimum!) / 100}
                  value={Number(current ?? field.minimum)}
                  onChange={(event) => set(name, Number(event.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              ) : (
                <Input
                  type="number"
                  disabled={disabled}
                  min={min}
                  value={current === undefined ? "" : String(current)}
                  onChange={(event) => set(name, event.target.value === "" ? undefined : Number(event.target.value))}
                />
              )}
              {help}
            </label>
          );
        }

        if (field.type === "array" && field.items?.type === "integer") {
          return (
            <div key={name}>
              <PagesField
                label={label}
                value={value[name] as number[] | undefined}
                pageCount={pageCount}
                disabled={disabled}
                onChange={(pages) => set(name, pages)}
              />
              {help}
            </div>
          );
        }

        if (field.type === "string") {
          if (/password/i.test(name)) {
            return (
              <div key={name}>
                <PasswordInput
                  id={`field-${name}`}
                  label={label}
                  value={String(current ?? "")}
                  disabled={disabled}
                  onChange={(text) => set(name, text)}
                />
                {help}
              </div>
            );
          }

          if (field.pattern?.includes("[0-9a-fA-F]{6}")) {
            return (
              <label key={name} className="flex items-center justify-between gap-3">
                <span className="text-[0.85rem] font-medium">{label}</span>
                <input
                  type="color"
                  disabled={disabled}
                  value={String(current ?? "#000000")}
                  onChange={(event) => set(name, event.target.value)}
                  className="h-8 w-12 cursor-pointer rounded-ctl border border-line-strong bg-surface p-0.5"
                />
              </label>
            );
          }

          return (
            <label key={name} className="block">
              <span className={labelClass}>{label}</span>
              <Input
                disabled={disabled}
                value={String(current ?? "")}
                maxLength={field.maxLength}
                onChange={(event) => set(name, event.target.value)}
              />
              {help}
            </label>
          );
        }

        return null;
      })}
    </div>
  );
}

/** Starting values: every field's default from the schema. */
export function defaultsFor(spec: OperationSpec | undefined): Settings {
  const result: Settings = {};

  for (const [name, raw] of Object.entries(spec?.params_schema.properties ?? {})) {
    if (raw.default !== undefined && raw.default !== null) result[name] = raw.default;
  }

  return result;
}
