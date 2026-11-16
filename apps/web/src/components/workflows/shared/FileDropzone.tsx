"use client";

import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  title: string;
  hint: string;
  /** Value for the input's accept attribute. */
  accept: string;
  /** Allowed lowercase extensions including the dot, e.g. [".pdf"]. */
  extensions: string[];
  maxBytes: number;
  busy: boolean;
  busyLabel: string;
  buttonLabel: string;
  /** Allow choosing several files at once. */
  multiple?: boolean;
  onSelect: (files: File[]) => void;
  onError: (message: string) => void;
}

/** Validates a dropped or selected file, then hands it to `onSelect`. */
export default function FileDropzone({
  title,
  hint,
  accept,
  extensions,
  maxBytes,
  busy,
  busyLabel,
  buttonLabel,
  multiple = false,
  onSelect,
  onError,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function problem(file: File): string {
    const name = file.name.toLowerCase();

    if (!extensions.some((extension) => name.endsWith(extension))) {
      return `Only ${extensions.join(", ")} files are accepted.`;
    }

    if (file.size === 0) return `${file.name} is empty.`;

    if (file.size > maxBytes) {
      return `${file.name} is larger than ${maxBytes / (1024 * 1024)} MB.`;
    }

    return "";
  }

  function handle(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, multiple ? undefined : 1);

    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;

    const message = files.map(problem).find(Boolean);

    if (message) onError(message);
    else onSelect(files);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!busy) handle(event.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center rounded-box border border-dashed px-6 py-10 text-center transition-colors",
        dragging
          ? "border-accent bg-accent-soft"
          : "border-line-strong bg-surface hover:border-fg-subtle",
      )}
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-ctl bg-hover text-fg-muted">
        {busy ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Upload className="size-5" strokeWidth={1.75} />
        )}
      </div>

      <h2 className="text-[0.95rem] font-medium">{busy ? busyLabel : title}</h2>

      <p className="mt-1 text-[0.82rem] text-fg-subtle">
        or select {multiple ? "files" : "a file"} from your device
      </p>

      <Button
        variant="secondary"
        size="lg"
        className="mt-4"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        <Upload className="size-4" strokeWidth={1.75} />
        {buttonLabel}
      </Button>

      <p className="mt-3 text-[0.75rem] text-fg-subtle">{hint}</p>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => handle(event.target.files)}
      />
    </div>
  );
}
