"use client";

import { ArrowLeft, ArrowDown, ArrowUp, FileText, Loader2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { SidebarPortal } from "@/components/layout/SidebarSlot";
import Button from "@/components/ui/Button";
import {
  compareFiles,
  deleteFile,
  imagesToPDF,
  listFiles,
  mergeFiles,
  uploadFile,
  type CompareResult,
  type StoredFileInfo,
} from "@/lib/api";
import { fileLabel, formatSize, timeAgo } from "@/lib/format";
import { officeToPdf } from "@/lib/intake";
import { TOOL_TARGETS } from "@/lib/operations";
import type { Route } from "@/lib/route";
import { categories, tools } from "@/lib/tools";
import { cn } from "@/lib/utils";

/** What a tool starts from. */
type Input = "pdf" | "pdfs" | "images" | "docx" | "pptx" | "compare";

const INPUTS: Record<string, Input> = {
  merge: "pdfs",
  "images-to-pdf": "images",
  "docx-to-pdf": "docx",
  "pptx-to-pdf": "pptx",
  compare: "compare",
};

const RULES: Record<Input, { kind: string; extensions: string[]; accept: string; noun: string; multiple: boolean }> = {
  pdf: { kind: "pdf", extensions: [".pdf"], accept: ".pdf,application/pdf", noun: "a PDF", multiple: false },
  pdfs: { kind: "pdf", extensions: [".pdf"], accept: ".pdf,application/pdf", noun: "PDFs", multiple: true },
  compare: { kind: "pdf", extensions: [".pdf"], accept: ".pdf,application/pdf", noun: "a PDF", multiple: false },
  images: { kind: "image", extensions: [".png", ".jpg", ".jpeg"], accept: ".png,.jpg,.jpeg,image/png,image/jpeg", noun: "images (PNG or JPEG)", multiple: true },
  docx: { kind: "docx", extensions: [".docx"], accept: ".docx", noun: "a Word file (.docx)", multiple: false },
  pptx: { kind: "pptx", extensions: [".pptx"], accept: ".pptx", noun: "a PowerPoint file (.pptx)", multiple: false },
};

interface ToolPageProps {
  id: string;
  navigate: (route: Route) => void;
}

/** A drop area plus a button, for choosing files from this computer. */
function UploadZone({
  rule,
  busy,
  onFiles,
  label,
}: {
  rule: (typeof RULES)[Input];
  busy: boolean;
  onFiles: (files: File[]) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function take(list: FileList | File[] | null) {
    const files = Array.from(list ?? []);

    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;

    const wrong = files.find((file) => !rule.extensions.some((extension) => file.name.toLowerCase().endsWith(extension)));

    if (wrong) {
      toast.error(`${wrong.name} is not ${rule.noun}. This tool takes ${rule.extensions.join(", ")} files.`);

      return;
    }

    onFiles(rule.multiple ? files : files.slice(0, 1));
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    take(event.dataTransfer.files);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center gap-2 rounded-box border border-dashed px-6 py-9 text-center transition-colors duration-200",
        dragging ? "border-accent bg-accent-soft/60" : "border-line-strong bg-surface",
      )}
    >
      {busy ? <Loader2 className="size-7 animate-spin text-accent" /> : <Upload className="size-7 text-fg-subtle" strokeWidth={1.5} />}
      <p className="font-medium">{busy ? "Working..." : (label ?? `Drop ${rule.noun} here`)}</p>
      <p className="text-[0.82rem] text-fg-subtle">or choose from this computer</p>
      <input ref={inputRef} type="file" accept={rule.accept} multiple={rule.multiple} className="hidden" onChange={(event) => take(event.target.files)} aria-label={`Choose ${rule.noun}`} />
      <Button variant="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
        Choose {rule.multiple ? "files" : "a file"}
      </Button>
    </div>
  );
}

/** Text differences between two PDFs. */
function CompareView({ result }: { result: CompareResult }) {
  return (
    <div className="space-y-3">
      <p className="text-[0.9rem] font-medium">
        {result.identical ? "The text is identical." : `${result.changes.length} page${result.changes.length === 1 ? "" : "s"} differ${result.truncated ? " (first 50 shown)" : ""}.`}
        <span className="ml-2 font-normal text-fg-subtle">
          First file {result.pages_first} p, second file {result.pages_second} p.
        </span>
      </p>
      <ul className="space-y-2">
        {result.changes.map((change) => (
          <li key={change.page} className="rounded-box border border-line bg-surface p-3 text-[0.85rem]">
            <p className="mb-1 font-mono text-[0.75rem] text-fg-subtle">
              Page {change.page}
              {change.only_in === "first" && " (only in the first file)"}
              {change.only_in === "second" && " (only in the second file)"}
            </p>
            {change.removed.map((line, index) => (
              <p key={`r${index}`} className="text-danger">&minus; {line}</p>
            ))}
            {change.added.map((line, index) => (
              <p key={`a${index}`} className="text-ok">+ {line}</p>
            ))}
          </li>
        ))}
      </ul>
      <p className="text-[0.78rem] text-fg-subtle">Red lines are only in the first file, green lines only in the second.</p>
    </div>
  );
}

/** One tool on its own page: choose a file here, then work on it. */
export default function ToolPage({ id, navigate }: ToolPageProps) {
  const tool = tools.find((item) => item.id === id);
  const input: Input = INPUTS[id] ?? "pdf";
  const rule = RULES[input];
  const [recent, setRecent] = useState<StoredFileInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<StoredFileInfo[]>([]);
  const [result, setResult] = useState<CompareResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    listFiles()
      .then((list) => {
        if (!cancelled) setRecent(list.filter((file) => file.available && file.kind === rule.kind).slice(0, 8));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [rule.kind]);

  function openInStudio(name: string) {
    const target = TOOL_TARGETS[id];

    navigate({ name: "studio", file: name, ...(typeof target === "object" ? { tool: target.tool, mode: target.mode } : {}) });
  }

  /** Store files from this computer and check they are the right type. */
  async function store(files: File[]): Promise<StoredFileInfo[]> {
    const stored: StoredFileInfo[] = [];

    for (const file of files) {
      const record = await uploadFile(file);

      if (record.kind !== rule.kind) {
        await deleteFile(record.name).catch(() => undefined);

        throw new Error(`${file.name} is not ${rule.noun}. This tool needs ${rule.noun}.`);
      }

      stored.push(record);
    }

    return stored;
  }

  /** A file was chosen for a tool that works on one file: go straight to working on it. */
  async function openSingle(record: StoredFileInfo) {
    if (input === "docx" || input === "pptx") {
      toast.message("Converting to PDF...");
      openInStudio(await officeToPdf(record));

      return;
    }

    openInStudio(record.name);
  }

  async function handleFiles(files: File[]) {
    setBusy(true);

    try {
      const stored = await store(files);

      if (input === "pdfs" || input === "images") setPicked((existing) => [...existing, ...stored]);
      else if (input === "compare") setPicked((existing) => [...existing, ...stored].slice(-2));
      else await openSingle(stored[0]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add that file.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseRecent(record: StoredFileInfo) {
    if (input === "pdfs" || input === "images") {
      setPicked((existing) => (existing.some((item) => item.name === record.name) ? existing : [...existing, record]));

      return;
    }

    if (input === "compare") {
      setPicked((existing) => (existing.some((item) => item.name === record.name) ? existing : [...existing, record].slice(-2)));

      return;
    }

    setBusy(true);

    try {
      await openSingle(record);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, by: number) {
    setPicked((existing) => {
      const next = [...existing];
      const target = index + by;

      if (target < 0 || target >= next.length) return existing;
      [next[index], next[target]] = [next[target], next[index]];

      return next;
    });
  }

  async function run() {
    setBusy(true);

    try {
      if (input === "pdfs") openInStudio((await mergeFiles(picked.map((file) => file.name))).output_filename);
      else if (input === "images") openInStudio((await imagesToPDF(picked.map((file) => file.name))).output_filename);
      else if (input === "compare") setResult(await compareFiles(picked[0].name, picked[1].name));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  if (!tool) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <p className="font-medium">That tool does not exist.</p>
        <Button className="mt-4" onClick={() => navigate({ name: "tools", category: "All tools" })}>
          <ArrowLeft className="size-4" /> All tools
        </Button>
      </div>
    );
  }

  const multi = input === "pdfs" || input === "images";
  const needed = input === "compare" ? 2 : input === "pdfs" ? 2 : 1;
  const actionLabel = input === "pdfs" ? `Merge ${picked.length || ""} PDFs`.replace("  ", " ") : input === "images" ? "Make a PDF" : "Compare";
  const how: Record<Input, string> = {
    pdf: "Choose a PDF and it opens in the editor with this tool ready.",
    pdfs: "Add two or more PDFs, put them in order, then merge them into one.",
    images: "Add images, put them in order, and each becomes one page of a new PDF.",
    docx: "Choose a Word file. It is converted to a PDF and opens in the editor.",
    pptx: "Choose a PowerPoint file. It is converted to a PDF and opens in the editor.",
    compare: "Choose two PDFs to see which pages and lines changed between them.",
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8">
      <SidebarPortal title="Browse tools">
        <nav className="space-y-0.5" aria-label="Tool categories">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => navigate({ name: "tools", category: item })}
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded-ctl px-2.5 text-left text-[0.86rem] font-medium transition-[background-color,color] duration-150",
                item === tool.category ? "bg-accent-soft font-semibold text-accent" : "text-fg-muted hover:bg-hover hover:text-fg",
              )}
            >
              <span className="flex-1 truncate">{item}</span>
            </button>
          ))}
        </nav>
      </SidebarPortal>

      <button type="button" onClick={() => navigate({ name: "tools", category: "All tools" })} className="mb-4 inline-flex items-center gap-1.5 text-[0.85rem] font-medium text-fg-muted transition-colors hover:text-fg">
        <ArrowLeft className="size-4" strokeWidth={1.75} /> All tools
      </button>

      <div className="pc-rise mb-6 flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-box bg-accent-soft text-accent">
          <tool.icon className="size-5" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{tool.name}</h1>
          <p className="mt-0.5 text-[0.9rem] text-fg-muted">{tool.description}</p>
        </div>
      </div>

      <div className="space-y-5">
        <p className="text-[0.85rem] text-fg-muted">{how[input]}</p>

        {input === "compare" && picked.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {[0, 1].map((slot) => (
              <div key={slot} className="rounded-box border border-line bg-surface px-3 py-2 text-[0.85rem]">
                <p className="text-[0.72rem] font-medium uppercase tracking-wide text-fg-subtle">{slot === 0 ? "First file" : "Second file"}</p>
                {picked[slot] ? (
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 shrink-0 text-fg-subtle" strokeWidth={1.5} />
                    <span className="min-w-0 flex-1 truncate font-medium">{fileLabel(picked[slot])}</span>
                    <button type="button" aria-label="Remove" onClick={() => setPicked((existing) => existing.filter((_, index) => index !== slot))} className="text-fg-subtle hover:text-danger">
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <p className="text-fg-subtle">Not chosen yet</p>
                )}
              </div>
            ))}
          </div>
        )}

        {multi && picked.length > 0 && (
          <ol className="space-y-1.5">
            {picked.map((file, index) => (
              <li key={`${file.name}-${index}`} className="pc-fade flex items-center gap-2 rounded-box border border-line bg-surface px-3 py-2 text-[0.85rem]">
                <span className="w-5 font-mono text-[0.75rem] text-fg-subtle">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{fileLabel(file)}</span>
                <span className="font-mono text-[0.72rem] text-fg-subtle">{formatSize(file.size_bytes)}</span>
                <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)} className="rounded-ctl p-1 text-fg-muted hover:bg-hover disabled:opacity-30">
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" aria-label="Move down" disabled={index === picked.length - 1} onClick={() => move(index, 1)} className="rounded-ctl p-1 text-fg-muted hover:bg-hover disabled:opacity-30">
                  <ArrowDown className="size-4" />
                </button>
                <button type="button" aria-label={`Remove ${fileLabel(file)}`} onClick={() => setPicked((existing) => existing.filter((_, position) => position !== index))} className="rounded-ctl p-1 text-fg-subtle hover:bg-hover hover:text-danger">
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ol>
        )}

        <UploadZone rule={rule} busy={busy} onFiles={(files) => void handleFiles(files)} label={multi || input === "compare" ? `Drop ${rule.noun} here` : undefined} />

        {(multi || input === "compare") && (
          <Button variant="primary" size="lg" className="w-full" disabled={busy || picked.length < needed} onClick={() => void run()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {actionLabel}
          </Button>
        )}

        {result && <CompareView result={result} />}

        {recent.length > 0 && (
          <section aria-label="Files you already have">
            <h2 className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wider text-fg-muted">Or use a file you already have</h2>
            <ul className="overflow-hidden rounded-box border border-line bg-surface">
              {recent.map((file) => (
                <li key={file.name} className="border-b border-line last:border-b-0">
                  <button type="button" disabled={busy} onClick={() => void chooseRecent(file)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-hover disabled:opacity-60">
                    <FileText className="size-4 shrink-0 text-fg-subtle" strokeWidth={1.5} />
                    <span className="min-w-0 flex-1 truncate text-[0.88rem] font-medium">{fileLabel(file)}</span>
                    <span className="font-mono text-[0.72rem] text-fg-subtle">{formatSize(file.size_bytes)}</span>
                    <span className="hidden text-[0.75rem] text-fg-subtle sm:inline">{timeAgo(file.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
