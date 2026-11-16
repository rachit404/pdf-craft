"use client";

import { useState } from "react";
import { AlignLeft, Check, ClipboardCopy, Download } from "lucide-react";

import { extractText, type ExtractedText } from "@/lib/api";

import PDFDropzone from "./shared/PDFDropzone";
import { usePDFWorkflow } from "./shared/usePDFWorkflow";
import {
  ErrorBanner,
  FileChip,
  formatSize,
  Notice,
  SubmitButton,
  WorkflowShell,
} from "./shared/ui";

/** Pages joined into one plain-text document. */
function combine(text: ExtractedText): string {
  return text.pages
    .map((page) => `--- Page ${page.page_number} ---\n${page.text.trim()}`)
    .join("\n\n");
}

export default function ExtractTextWorkflow({ onBack }: { onBack: () => void }) {
  const workflow = usePDFWorkflow();
  const { file, info } = workflow;

  const [text, setText] = useState<ExtractedText | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleExtract() {
    if (!file) return;

    workflow.setError("");
    setLoading(true);

    try {
      setText(await extractText(file.stored_filename));
    } catch (err) {
      workflow.setError(
        err instanceof Error ? err.message : "Could not extract the text.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(combine(text));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      workflow.setError("Copying was blocked by the browser. Download instead.");
    }
  }

  function handleDownload() {
    if (!text || !file) return;

    // Built in the browser: nothing is stored on the server.
    const url = URL.createObjectURL(
      new Blob([combine(text)], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");

    link.href = url;
    link.download = `${file.original_filename.replace(/\.pdf$/i, "")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <WorkflowShell
      icon={AlignLeft}
      title="PDF to Text"
      description="Pull the selectable text out of every page."
      onBack={onBack}
    >
      {!file || !info ? (
        <PDFDropzone workflow={workflow} />
      ) : (
        <section className="space-y-6">
          <FileChip
            name={file.original_filename}
            detail={`${formatSize(file.size_bytes)} · ${info.page_count} pages`}
            disabled={loading}
            onRemove={() => {
              workflow.reset();
              setText(null);
            }}
          />

          {!text ? (
            <SubmitButton
              label="Extract text"
              busyLabel="Extracting..."
              icon={AlignLeft}
              busy={loading}
              onClick={() => void handleExtract()}
            />
          ) : text.total_characters === 0 ? (
            <Notice tone="warning">
              No selectable text was found. This is usually a scanned document;
              text recognition (OCR) is planned for a later version.
            </Notice>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-500">
                  {text.total_characters.toLocaleString()} characters on{" "}
                  {text.page_count} pages
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={() => void handleCopy()}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-violet-300"
                  >
                    {copied ? <Check size={16} /> : <ClipboardCopy size={16} />}
                    {copied ? "Copied" : "Copy all"}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
                  >
                    <Download size={16} />
                    Download .txt
                  </button>
                </div>
              </div>

              <div className="max-h-[32rem] space-y-4 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                {text.pages.map((page) => (
                  <div key={page.page_number}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Page {page.page_number}
                    </p>
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-gray-800">
                      {page.text.trim() || "(no text on this page)"}
                    </pre>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <ErrorBanner message={workflow.error} />
    </WorkflowShell>
  );
}
