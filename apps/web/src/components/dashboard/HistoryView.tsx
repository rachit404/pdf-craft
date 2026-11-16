"use client";

import { useEffect, useState } from "react";
import { Clock3, Download, Loader2, Trash2 } from "lucide-react";

import {
  deleteAllFiles,
  deleteHistoryEntry,
  getDownloadUrl,
  getRetentionHours,
  listHistory,
  type HistoryEntry,
} from "@/lib/api";

import {
  ErrorBanner,
  formatSize,
  Notice,
  WorkflowShell,
} from "@/components/workflows/shared/ui";

/** API route segment → name shown to the user. */
const OPERATION_NAMES: Record<string, string> = {
  merge: "Merge PDF",
  split: "Split PDF",
  "extract-pages": "Extract pages",
  "reorder-pages": "Reorder pages",
  "delete-pages": "Delete pages",
  "duplicate-pages": "Duplicate pages",
  rotate: "Rotate PDF",
  compress: "Compress PDF",
  watermark: "Add watermark",
  "page-numbers": "Page numbers",
  "header-footer": "Header & footer",
  background: "Background",
  crop: "Crop PDF",
  "add-text": "Add text",
  "add-image": "Add image",
  "to-images": "PDF to images",
  "images-to-pdf": "Images to PDF",
  "to-docx": "PDF to Word",
  "to-xlsx": "PDF to Excel",
  "to-pptx": "PDF to PowerPoint",
  "docx-to-pdf": "Word to PDF",
  "pptx-to-pdf": "PowerPoint to PDF",
  protect: "Protect PDF",
  unlock: "Unlock PDF",
  redact: "Redact PDF",
  sanitize: "Sanitize PDF",
};

function retentionText(hours: number | null): string {
  if (hours === null) return "";
  if (hours <= 0) return "Files are kept until you delete them.";

  const period =
    hours >= 48
      ? `${Math.round(hours / 24)} days`
      : `${hours} hour${hours === 1 ? "" : "s"}`;

  return `Files are deleted automatically after ${period}.`;
}

/** e.g. "contract.pdf" + "rotate" → "contract-rotate" (server adds the extension). */
function downloadName(entry: HistoryEntry): string {
  const source = (entry.original_filename ?? "document")
    .replace(/ \+ \d+ more$/, "")
    .replace(/\.[^.]+$/, "");

  return `${source}-${entry.operation}`;
}

export default function HistoryView({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [retention, setRetention] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function load() {
    try {
      const all = await listHistory();
      setEntries(all.filter((entry) => entry.output_filename));
    } catch (err) {
      setEntries([]);
      setError(err instanceof Error ? err.message : "Could not load history.");
    }
  }

  useEffect(() => {
    let cancelled = false;

    Promise.all([listHistory(), getRetentionHours().catch(() => null)])
      .then(([all, hours]) => {
        if (cancelled) return;

        setEntries(all.filter((entry) => entry.output_filename));
        setRetention(hours);
      })
      .catch((err: unknown) => {
        if (cancelled) return;

        setEntries([]);
        setError(err instanceof Error ? err.message : "Could not load history.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function act(action: () => Promise<unknown>) {
    setError("");
    setBusy(true);

    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The action failed.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <WorkflowShell
      icon={Clock3}
      title="Recent files"
      description="Files produced on this server. Download them again or remove them."
      onBack={onBack}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{retentionText(retention)}</p>

        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">
              Delete every stored file?
            </span>
            <button
              onClick={() => void act(deleteAllFiles)}
              disabled={busy}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              Yes, delete all
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 size={16} />
            Delete all my files
          </button>
        )}
      </div>

      {confirming && (
        <div className="mb-6">
          <Notice tone="warning">
            This removes all uploads and results from the server straight away,
            including files other open tools are still using. It cannot be
            undone.
          </Notice>
        </div>
      )}

      {entries === null ? (
        <div className="flex justify-center py-16 text-gray-400">
          <Loader2 className="animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-16 text-center">
          <p className="font-semibold text-gray-900">No files yet</p>
          <p className="mt-2 text-sm text-gray-500">
            Results from the tools will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => {
            const available = entry.output_size_bytes !== null;

            return (
              <li
                key={entry.public_id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {OPERATION_NAMES[entry.operation] ?? entry.operation}
                    {entry.original_filename && (
                      <span className="font-normal text-gray-500">
                        {" "}
                        · {entry.original_filename}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(entry.created_at).toLocaleString()}
                    {available
                      ? ` · ${formatSize(entry.output_size_bytes ?? 0)}`
                      : " · file no longer available"}
                  </p>
                </div>

                {available && entry.output_filename && (
                  <a
                    href={getDownloadUrl(
                      entry.output_filename,
                      downloadName(entry),
                    )}
                    download
                    className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
                  >
                    <Download size={15} />
                    Download
                  </a>
                )}

                <button
                  onClick={() =>
                    void act(() => deleteHistoryEntry(entry.public_id))
                  }
                  disabled={busy}
                  aria-label="Delete this file"
                  className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                >
                  <Trash2 size={17} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ErrorBanner message={error} />
    </WorkflowShell>
  );
}
