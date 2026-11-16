"use client";

import { Download, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import Button from "@/components/ui/Button";
import { StatusDot } from "@/components/ui/controls";
import {
  deleteAllFiles,
  deleteFile,
  getFileDownloadUrl,
  getRetentionHours,
  listFiles,
  type StoredFileInfo,
} from "@/lib/api";
import { formatSize, timeAgo, timeLeft } from "@/lib/format";
import { cn } from "@/lib/utils";

/** API route segment or registry id to what the user sees. */
const OPERATION_NAMES: Record<string, string> = {
  merge: "Merged",
  split: "Split",
  "extract-pages": "Pages extracted",
  "reorder-pages": "Reordered",
  "delete-pages": "Pages deleted",
  "duplicate-pages": "Pages duplicated",
  rotate: "Rotated",
  compress: "Made smaller",
  watermark: "Watermarked",
  "page-numbers": "Page numbers added",
  "header-footer": "Header and footer added",
  background: "Background added",
  crop: "Cropped",
  "add-text": "Text added",
  "add-image": "Image added",
  "to-images": "Converted to images",
  "images-to-pdf": "Created from images",
  "to-docx": "Converted to Word",
  "to-xlsx": "Converted to Excel",
  "to-pptx": "Converted to PowerPoint",
  "docx-to-pdf": "Converted to PDF",
  "pptx-to-pdf": "Converted to PDF",
  protect: "Password added",
  unlock: "Unlocked",
  redact: "Redacted",
  sanitize: "Cleaned",
};

const KIND_LABELS: Record<string, string> = {
  pdf: "PDF",
  image: "Image",
  docx: "Word",
  pptx: "PowerPoint",
  xlsx: "Excel",
  zip: "ZIP",
};

function describe(file: StoredFileInfo): string {
  if (!file.operation) return "Uploaded";

  return OPERATION_NAMES[file.operation.replace(/_/g, "-")] ?? file.operation;
}

function retentionText(hours: number | null): string {
  if (hours === null) return "";
  if (hours <= 0) return "Files are kept until you delete them.";

  return `Files are deleted automatically ${hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hour${hours === 1 ? "" : "s"}`} after they are created.`;
}

/** Everything stored on the server, with when it will be removed. */
export default function FilesPage() {
  const [files, setFiles] = useState<StoredFileInfo[] | null>(null);
  const [retention, setRetention] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    Promise.all([listFiles(), getRetentionHours().catch(() => null)])
      .then(([list, hours]) => {
        if (cancelled) return;

        setFiles(list);
        setRetention(hours);
        setNow(Date.now());
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        setFiles([]);
        toast.error(error instanceof Error ? error.message : "Could not load your files.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true);

    try {
      await action();
      setFiles(await listFiles());
      setNow(Date.now());
      toast.success(done);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-lg font-semibold tracking-tight">
          Files
          {files && <span className="ml-2 font-mono text-[0.8rem] font-normal text-fg-subtle">{files.length}</span>}
        </h1>

        {confirming ? (
          <div className="flex items-center gap-2 text-[0.85rem]">
            <span className="text-fg-muted">Delete every stored file?</span>
            <Button variant="danger" disabled={busy} onClick={() => void act(deleteAllFiles, "All files deleted")}>
              Yes, delete all
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="danger" disabled={busy || !files?.length} onClick={() => setConfirming(true)}>
            <Trash2 className="size-4" strokeWidth={1.75} />
            Delete all my files
          </Button>
        )}
      </div>

      <p className="mb-4 text-[0.85rem] text-fg-muted">
        {retentionText(retention)} Nothing here is shared or sent anywhere.
      </p>

      {files === null ? (
        <div className="flex justify-center py-16 text-fg-subtle">
          <Loader2 className="animate-spin" />
        </div>
      ) : files.length === 0 ? (
        <div className="rounded-box border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <p className="font-medium">No files stored</p>
          <p className="mt-1 text-[0.85rem] text-fg-subtle">Files you upload and the results you make appear here.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-box border border-line bg-surface">
          <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_5rem_6.5rem_6rem_5rem] gap-3 border-b border-line bg-panel px-4 py-2 text-[0.75rem] font-medium text-fg-subtle md:grid">
            <span>Name</span>
            <span>Type</span>
            <span>Size</span>
            <span>Created</span>
            <span>Removed in</span>
            <span />
          </div>

          <ul>
            {files.map((file) => {
              const left = timeLeft(file.expires_at, now);

              return (
                <li
                  key={file.name}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_5.5rem_5rem_6.5rem_6rem_5rem]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[0.9rem] font-medium">{file.original_name}</p>
                    <p className="truncate text-[0.78rem] text-fg-subtle">{describe(file)}</p>
                  </div>
                  <span className="hidden text-[0.8rem] text-fg-muted md:block">{KIND_LABELS[file.kind] ?? file.kind}</span>
                  <span className="hidden font-mono text-[0.78rem] text-fg-muted md:block">{formatSize(file.size_bytes)}</span>
                  <span className="hidden text-[0.8rem] text-fg-muted md:block">{timeAgo(file.created_at, now)}</span>
                  <span className={cn("hidden font-mono text-[0.78rem] md:block", left.soon ? "text-warn" : "text-fg-muted")}>
                    {left.text}
                  </span>
                  <div className="flex items-center justify-end gap-1">
                    {file.available ? (
                      <a
                        href={getFileDownloadUrl(file.name)}
                        download
                        aria-label={`Download ${file.original_name}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-ctl text-fg-muted hover:bg-hover hover:text-fg"
                      >
                        <Download className="size-4" strokeWidth={1.75} />
                      </a>
                    ) : (
                      <StatusDot tone="muted">gone</StatusDot>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Delete ${file.original_name}`}
                      onClick={() => void act(() => deleteFile(file.name), "File deleted")}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-ctl text-fg-subtle hover:bg-hover hover:text-danger disabled:opacity-40"
                    >
                      <Trash2 className="size-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
