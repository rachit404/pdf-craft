"use client";

import { ChevronLeft, ChevronRight, Download, FileQuestion, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import Button from "@/components/ui/Button";
import { getFileDownloadUrl, getFileInfo, inspectPDF, type StoredFileInfo } from "@/lib/api";
import { formatSize } from "@/lib/format";
import { cn } from "@/lib/utils";

import PagePreview from "./PagePreview";

const KIND_LABELS: Record<string, string> = {
  pdf: "PDF",
  image: "Image",
  docx: "Word document",
  pptx: "PowerPoint",
  xlsx: "Excel workbook",
  zip: "ZIP archive",
};

/** A PDF page by page. */
function PdfView({ name }: { name: string }) {
  const [pages, setPages] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let cancelled = false;

    inspectPDF(name)
      .then((info) => {
        if (!cancelled) setPages(info.page_count);
      })
      .catch((error: unknown) => {
        if (!cancelled) setProblem(error instanceof Error ? error.message : "Could not open this PDF.");
      });

    return () => {
      cancelled = true;
    };
  }, [name]);

  if (problem) return <p className="p-6 text-center text-[0.85rem] text-fg-muted">{problem}</p>;

  if (pages === null) {
    return (
      <div className="flex h-48 items-center justify-center text-fg-subtle">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return <PagePreview filename={name} pageCount={pages} page={page} onPageChange={(next) => setPage(Math.min(Math.max(next, 1), pages))} widthClass="max-w-xl" />;
}

/** Look at one or several stored files: PDFs page by page, images as they are, other types as a card. */
export default function FilePreview({ names, className }: { names: string[]; className?: string }) {
  const [index, setIndex] = useState(0);
  const [infos, setInfos] = useState<Record<string, StoredFileInfo | null>>({});
  const key = names.join("|");
  const current = names[Math.min(index, names.length - 1)];

  useEffect(() => {
    let cancelled = false;

    Promise.all(names.slice(0, 60).map((name) => getFileInfo(name).then((info) => [name, info] as const, () => [name, null] as const))).then((pairs) => {
      if (!cancelled) setInfos(Object.fromEntries(pairs));
    });

    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (names.length === 0) return null;

  const info = infos[current];
  const kind = info?.kind ?? (current.endsWith(".pdf") ? "pdf" : "");

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {names.length > 1 && (
        <div className="mb-3 flex items-center gap-2">
          <Button size="sm" variant="ghost" aria-label="Previous file" disabled={index <= 0} onClick={() => setIndex(index - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-0 flex-1 truncate text-center text-[0.82rem] font-medium">
            File {index + 1} of {names.length}
            {info ? ` · ${info.original_name}` : ""}
          </span>
          <Button size="sm" variant="ghost" aria-label="Next file" disabled={index >= names.length - 1} onClick={() => setIndex(index + 1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {kind === "pdf" ? (
          <PdfView key={current} name={current} />
        ) : kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- stored file, not optimizable
          <img src={getFileDownloadUrl(current)} alt={info?.original_name ?? "Preview"} className="mx-auto max-h-[60vh] rounded-[2px] bg-page object-contain shadow-[0_0_0_1px_var(--line-strong)]" />
        ) : (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-2 rounded-box border border-line bg-panel px-6 py-10 text-center">
            <FileQuestion className="size-8 text-fg-subtle" strokeWidth={1.5} />
            <p className="font-medium">{info?.original_name ?? "This file"}</p>
            <p className="text-[0.8rem] text-fg-muted">
              {KIND_LABELS[kind] ?? "File"}
              {info ? ` · ${formatSize(info.size_bytes)}` : ""}
            </p>
            <p className="text-[0.8rem] text-fg-subtle">{kind ? "This type cannot be shown here. Download it to open it." : "Loading..."}</p>
            {kind && (
              <a href={getFileDownloadUrl(current)} download className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-ctl border border-line-strong bg-surface px-3 text-[0.85rem] font-medium hover:bg-hover">
                <Download className="size-4" strokeWidth={1.75} /> Download
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
