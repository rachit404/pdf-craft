"use client";

import { Download, FolderOpen, Loader2, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import Button from "@/components/ui/Button";
import { StatusDot } from "@/components/ui/controls";
import {
  deleteAllFiles,
  deleteFile,
  downloadZip,
  getFileDownloadUrl,
  getRetentionHours,
  listFiles,
  searchFiles,
  type SearchResult,
  type StoredFileInfo,
} from "@/lib/api";
import { fileLabel, formatSize, timeAgo, timeLeft } from "@/lib/format";
import { operationName } from "@/lib/operations";
import type { Route } from "@/lib/route";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<string, string> = {
  pdf: "PDF",
  image: "Image",
  docx: "Word",
  pptx: "PowerPoint",
  xlsx: "Excel",
  zip: "ZIP",
};

function retentionText(hours: number | null): string {
  if (hours === null) return "";
  if (hours <= 0) return "Files are kept until you delete them.";

  return `Files are deleted automatically ${hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hour${hours === 1 ? "" : "s"}`} after they are created.`;
}

interface FilesPageProps {
  navigate: (route: Route) => void;
}

/** What is stored on the server: open, download or delete it. Tools take new files themselves. */
export default function FilesPage({ navigate }: FilesPageProps) {
  const [files, setFiles] = useState<StoredFileInfo[] | null>(null);
  const [retention, setRetention] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);

  async function search() {
    if (query.trim().length < 2) return;

    setSearching(true);

    try {
      setFound(await searchFiles(query.trim()));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The search did not work.");
    } finally {
      setSearching(false);
    }
  }

  const refresh = useCallback(async () => {
    setFiles(await listFiles());
    setNow(Date.now());
  }, []);

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

  async function act(action: () => Promise<unknown>, done?: string) {
    setBusy(true);

    try {
      await action();
      await refresh();
      if (done) toast.success(done);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const byName = new Map((files ?? []).map((file) => [file.name, file]));
  const chosen = checked.map((name) => byName.get(name)).filter((file): file is StoredFileInfo => Boolean(file));

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
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

      <form
        className="mb-4 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-fg-subtle" strokeWidth={1.75} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search inside your PDFs"
            aria-label="Search inside your PDFs"
            maxLength={100}
            className="h-8 w-full rounded-ctl border border-line-strong bg-surface pl-8 pr-2.5 text-[0.85rem] placeholder:text-fg-subtle"
          />
        </div>
        <Button type="submit" disabled={searching || query.trim().length < 2}>
          {searching && <Loader2 className="size-4 animate-spin" />} Search
        </Button>
      </form>

      {found && (
        <div className="mb-4 rounded-box border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-2 text-[0.82rem]">
            <span className="font-medium">
              {found.hits.length === 0 ? "Nothing found" : `${found.hits.length} match${found.hits.length === 1 ? "" : "es"}`} for &ldquo;{found.query}&rdquo;
              <span className="ml-2 font-normal text-fg-subtle">
                {found.files_searched} PDF{found.files_searched === 1 ? "" : "s"} searched{found.complete ? "" : ", stopped early"}
              </span>
            </span>
            <button type="button" aria-label="Close results" onClick={() => setFound(null)} className="text-fg-subtle hover:text-fg">
              <X className="size-4" />
            </button>
          </div>
          <ul className="max-h-60 overflow-y-auto">
            {found.hits.map((hit, index) => (
              <li key={`${hit.name}-${hit.page}-${index}`}>
                <button type="button" onClick={() => navigate({ name: "studio", file: hit.name })} className="block w-full border-b border-line px-4 py-2 text-left last:border-b-0 hover:bg-hover">
                  <span className="text-[0.85rem] font-medium">{hit.original_name}</span>
                  <span className="ml-2 font-mono text-[0.72rem] text-fg-subtle">page {hit.page}</span>
                  <span className="block truncate text-[0.8rem] text-fg-muted">{hit.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mb-3 text-[0.82rem] text-fg-muted">{retentionText(retention)} Nothing here is shared or sent anywhere.</p>

      {checked.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-box border border-line bg-panel px-3 py-2 text-[0.85rem]">
          <span className="mr-auto font-medium">{checked.length} selected</span>
          {chosen.length >= 2 && (
            <Button disabled={busy} onClick={() => void act(() => downloadZip(chosen.map((file) => file.name)))}>
              <Download className="size-4" strokeWidth={1.75} /> Download as ZIP
            </Button>
          )}
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                for (const name of checked) await deleteFile(name);
                setChecked([]);
              }, "Deleted")
            }
          >
            <Trash2 className="size-4" strokeWidth={1.75} /> Delete
          </Button>
          <Button variant="ghost" onClick={() => setChecked([])}>Clear</Button>
        </div>
      )}

      {files === null ? (
        <div className="flex justify-center py-16 text-fg-subtle">
          <Loader2 className="animate-spin" />
        </div>
      ) : files.length === 0 ? (
        <div className="rounded-box border border-line bg-surface px-6 py-10 text-center">
          <p className="font-medium">No files yet</p>
          <p className="mt-1 text-[0.85rem] text-fg-subtle">Files you add in a tool or a flow are kept here until they are removed.</p>
          <Button className="mt-4" onClick={() => navigate({ name: "tools", category: "All tools" })}>
            <FolderOpen className="size-4" strokeWidth={1.75} /> Open a tool
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-box border border-line bg-surface">
          <div className="hidden grid-cols-[1.5rem_minmax(0,1fr)_5.5rem_5rem_6.5rem_6rem_5rem] gap-3 border-b border-line bg-panel px-4 py-2 text-[0.75rem] font-medium text-fg-subtle md:grid">
            <span />
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
              const order = checked.indexOf(file.name);
              const openable = file.available && file.kind === "pdf";

              return (
                <li
                  key={file.name}
                  className="pc-fade grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-4 py-2.5 transition-colors duration-150 last:border-b-0 hover:bg-hover/50 md:grid-cols-[1.5rem_minmax(0,1fr)_5.5rem_5rem_6.5rem_6rem_5rem]"
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${fileLabel(file)}`}
                    checked={order >= 0}
                    disabled={!file.available}
                    onChange={(event) =>
                      setChecked((existing) => (event.target.checked ? [...existing, file.name] : existing.filter((name) => name !== file.name)))
                    }
                    className="size-4 accent-[var(--accent)]"
                  />
                  <button
                    type="button"
                    disabled={!openable}
                    onClick={() => navigate({ name: "studio", file: file.name })}
                    className="min-w-0 text-left disabled:cursor-default"
                  >
                    <p className={cn("truncate text-[0.9rem] font-medium", openable && "hover:text-accent")}>
                      {order >= 0 && <span className="mr-1.5 font-mono text-[0.75rem] text-accent">{order + 1}</span>}
                      {fileLabel(file)}
                    </p>
                    <p className="truncate text-[0.78rem] text-fg-subtle">{operationName(file.operation)}</p>
                  </button>
                  <span className="hidden text-[0.8rem] text-fg-muted md:block">{KIND_LABELS[file.kind] ?? file.kind}</span>
                  <span className="hidden font-mono text-[0.78rem] text-fg-muted md:block">{formatSize(file.size_bytes)}</span>
                  <span className="hidden text-[0.8rem] text-fg-muted md:block">{timeAgo(file.created_at, now)}</span>
                  <span className={cn("hidden font-mono text-[0.78rem] md:block", left.soon ? "text-warn" : "text-fg-muted")}>{left.text}</span>
                  <div className="flex items-center justify-end gap-1">
                    {file.available ? (
                      <a
                        href={getFileDownloadUrl(file.name)}
                        download
                        aria-label={`Download ${fileLabel(file)}`}
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
                      aria-label={`Delete ${fileLabel(file)}`}
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
