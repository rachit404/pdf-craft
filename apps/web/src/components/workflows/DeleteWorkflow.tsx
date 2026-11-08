"use client";

import { useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  deletePages,
  getDownloadUrl,
  inspectPDF,
  uploadPDF,
  type PDFInfo,
  type PDFOperationResponse,
  type UploadedPDF,
} from "@/lib/api";

interface DeleteWorkflowProps {
  onBack: () => void;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function parsePages(value: string, totalPages: number): number[] {
  const tokens = value.split(",").map((item) => item.trim());

  if (!value.trim() || tokens.some((token) => !token)) {
    throw new Error("Enter pages or ranges, for example 2,4-6.");
  }

  const pages: number[] = [];

  for (const token of tokens) {
    const match = token.match(/^(\d+)(?:\s*-\s*(\d+))?$/);

    if (!match) {
      throw new Error(`Invalid page selection: "${token}".`);
    }

    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 1 ||
      end < start ||
      end > totalPages
    ) {
      throw new Error(`Page numbers must be between 1 and ${totalPages}.`);
    }

    for (let page = start; page <= end; page++) {
      pages.push(page);
    }
  }

  if (new Set(pages).size !== pages.length) {
    throw new Error("Duplicate page numbers are not allowed.");
  }

  if (pages.length >= totalPages) {
    throw new Error("You cannot delete every page from a PDF.");
  }

  if (pages.length > 500) {
    throw new Error("You can delete a maximum of 500 pages.");
  }

  return pages;
}

export default function DeleteWorkflow({ onBack }: DeleteWorkflowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<UploadedPDF | null>(null);
  const [info, setInfo] = useState<PDFInfo | null>(null);
  const [selection, setSelection] = useState("");
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PDFOperationResponse | null>(null);

  async function handleFile(selectedFile?: File) {
    if (!selectedFile) return;

    setError("");
    setResult(null);
    setFile(null);
    setInfo(null);
    setSelection("");

    if (!selectedFile.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted.");
      return;
    }

    if (selectedFile.size === 0) {
      setError("The selected file is empty.");
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError("Maximum file size is 25 MB.");
      return;
    }

    setUploading(true);

    try {
      const uploaded = await uploadPDF(selectedFile);
      const pdfInfo = await inspectPDF(uploaded.stored_filename);

      setFile(uploaded);
      setInfo(pdfInfo);
      setSelection("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not upload or inspect PDF.",
      );
    } finally {
      setUploading(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  async function handleDelete() {
    if (!file || !info) return;

    let pages: number[];

    try {
      pages = parsePages(selection, info.page_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid page selection.");
      return;
    }

    setError("");
    setResult(null);
    setProcessing(true);

    try {
      const response = await deletePages(file.stored_filename, pages);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Page deletion failed.");
    } finally {
      setProcessing(false);
    }
  }

  function resetFile() {
    setFile(null);
    setInfo(null);
    setSelection("");
    setResult(null);
    setError("");
  }

  const selectedCount = (() => {
    if (!info || !selection.trim()) return 0;

    try {
      return parsePages(selection, info.page_count).length;
    } catch {
      return 0;
    }
  })();

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8">
      <button
        onClick={onBack}
        className="mb-7 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft size={17} />
        Back to tools
      </button>

      <div className="mb-8">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <Trash2 size={23} />
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Delete PDF pages
        </h1>

        <p className="mt-2 text-sm leading-6 text-gray-500">
          Remove unwanted pages and create a new PDF with the remaining pages.
        </p>
      </div>

      {!file && (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handleFile(event.dataTransfer.files[0]);
          }}
          className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
            dragging
              ? "border-red-500 bg-red-50"
              : "border-gray-300 bg-white hover:border-red-300"
          }`}
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            {uploading ? (
              <Loader2 size={25} className="animate-spin" />
            ) : (
              <Upload size={25} />
            )}
          </div>

          <h2 className="font-semibold text-gray-900">
            {uploading
              ? "Uploading and inspecting PDF..."
              : "Drop your PDF here"}
          </h2>

          <p className="mt-2 text-sm text-gray-500">
            or select a file from your device
          </p>

          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 size={17} className="animate-spin" />
                Please wait...
              </>
            ) : (
              <>
                <Upload size={17} />
                Select PDF
              </>
            )}
          </button>

          <p className="mt-4 text-xs text-gray-400">PDF only · Maximum 25 MB</p>

          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
        </div>
      )}

      {file && info && (
        <section className="space-y-6">
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <FileText size={21} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">
                {file.original_filename}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {formatSize(file.size_bytes)} · {info.page_count} pages
              </p>
            </div>

            <button
              onClick={resetFile}
              disabled={processing}
              aria-label="Remove PDF"
              className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
            >
              <Trash2 size={18} />
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
            <h2 className="font-semibold text-gray-900">
              Select pages to delete
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Enter individual page numbers or ranges separated by commas.
            </p>

            <label className="mb-2 mt-5 block text-sm font-medium text-gray-700">
              Page selection
            </label>

            <input
              type="text"
              value={selection}
              disabled={processing}
              onChange={(event) => {
                setSelection(event.target.value);
                setResult(null);
                setError("");
              }}
              placeholder="Example: 2,4-6,9"
              className="h-12 w-full rounded-xl border border-gray-200 px-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-red-400 focus:ring-4 focus:ring-red-100"
            />

            <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-gray-400">
              <span>Valid pages: 1 to {info.page_count}</span>
              <span>{selectedCount} pages selected</span>
            </div>

            <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-800">
                Pages will be permanently excluded from the output PDF.
              </p>
              <p className="mt-1 text-xs leading-5 text-red-700">
                Your uploaded original file remains unchanged. You cannot delete
                every page.
              </p>
            </div>

            {selectedCount > 0 && (
              <p className="mt-4 text-sm font-medium text-gray-700">
                {info.page_count - selectedCount} pages will remain in the
                output PDF.
              </p>
            )}
          </div>

          <button
            onClick={handleDelete}
            disabled={processing || !selection.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Deleting pages...
              </>
            ) : (
              <>
                <Trash2 size={18} />
                Delete selected pages
              </>
            )}
          </button>
        </section>
      )}

      {error && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <X size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={23} className="shrink-0 text-emerald-600" />

            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-emerald-900">
                Pages deleted successfully
              </h2>

              <p className="mt-2 text-sm text-emerald-800">
                Created a new PDF containing {result.page_count} pages.
              </p>

              <p className="mt-1 text-xs text-emerald-700">
                Output size: {formatSize(result.output_size_bytes)}
              </p>

              <a
                href={getDownloadUrl(result.output_filename)}
                download
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                <Download size={17} />
                Download updated PDF
              </a>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
