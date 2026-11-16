"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

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
  onSelect: (file: File) => void;
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
  onSelect,
  onError,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handle(file?: File) {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    const name = file.name.toLowerCase();

    if (!extensions.some((extension) => name.endsWith(extension))) {
      onError(`Only ${extensions.join(", ")} files are accepted.`);
    } else if (file.size === 0) {
      onError("The selected file is empty.");
    } else if (file.size > maxBytes) {
      onError(`Maximum file size is ${maxBytes / (1024 * 1024)} MB.`);
    } else {
      onSelect(file);
    }
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
        if (!busy) handle(event.dataTransfer.files[0]);
      }}
      className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
        dragging
          ? "border-violet-500 bg-violet-50"
          : "border-gray-300 bg-white hover:border-violet-300"
      }`}
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
        {busy ? (
          <Loader2 size={25} className="animate-spin" />
        ) : (
          <Upload size={25} />
        )}
      </div>

      <h2 className="font-semibold text-gray-900">
        {busy ? busyLabel : title}
      </h2>

      <p className="mt-2 text-sm text-gray-500">
        or select a file from your device
      </p>

      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
      >
        <Upload size={17} />
        {buttonLabel}
      </button>

      <p className="mt-4 text-xs text-gray-400">{hint}</p>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => handle(event.target.files?.[0])}
      />
    </div>
  );
}
