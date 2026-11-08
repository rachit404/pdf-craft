"use client";

import { useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  getDownloadUrl,
  inspectPDF,
  splitPDF,
  uploadPDF,
  type PDFInfo,
  type SplitResponse,
  type UploadedPDF,
} from "@/lib/api";

interface PageRange {
  id: string;
  start: string;
  end: string;
}

interface SplitWorkflowProps {
  onBack: () => void;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function SplitWorkflow({ onBack }: SplitWorkflowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<UploadedPDF | null>(null);
  const [info, setInfo] = useState<PDFInfo | null>(null);
  const [ranges, setRanges] = useState<PageRange[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SplitResponse | null>(null);

  async function handleFile(selectedFile?: File) {
    if (!selectedFile) return;

    setError("");
    setResult(null);
    setFile(null);
    setInfo(null);
    setRanges([]);

    if (!selectedFile.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted.");
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError("Maximum file size is 25 MB.");
      return;
    }

    if (selectedFile.size === 0) {
      setError("The selected file is empty.");
      return;
    }

    setUploading(true);

    try {
      const uploaded = await uploadPDF(selectedFile);
      const pdfInfo = await inspectPDF(uploaded.stored_filename);

      if (pdfInfo.page_count < 2) {
        throw new Error("This PDF must contain at least two pages to split.");
      }

      setFile(uploaded);
      setInfo(pdfInfo);
      setRanges([
        {
          id: crypto.randomUUID(),
          start: "1",
          end: String(pdfInfo.page_count),
        },
      ]);
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

  function updateRange(id: string, field: "start" | "end", value: string) {
    setRanges((current) =>
      current.map((range) =>
        range.id === id ? { ...range, [field]: value } : range,
      ),
    );
    setResult(null);
  }

  function addRange() {
    if (!info) return;

    setRanges((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        start: "1",
        end: String(info.page_count),
      },
    ]);

    setResult(null);
  }

  function removeRange(id: string) {
    setRanges((current) => current.filter((range) => range.id !== id));
    setResult(null);
  }

  function validateRanges(): number[][] | null {
    if (!info) return null;

    if (ranges.length < 1) {
      setError("Add at least one page range.");
      return null;
    }

    const parsed: number[][] = [];

    for (let index = 0; index < ranges.length; index++) {
      const range = ranges[index];
      const start = Number(range.start);
      const end = Number(range.end);

      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 1 ||
        end < start ||
        end > info.page_count
      ) {
        setError(
          `Range ${index + 1} must contain valid pages between 1 and ${info.page_count}.`,
        );
        return null;
      }

      parsed.push([start, end]);
    }

    setError("");
    return parsed;
  }

  async function handleSplit() {
    if (!file || !info) return;

    const validRanges = validateRanges();
    if (!validRanges) return;

    setProcessing(true);
    setResult(null);

    try {
      const response = await splitPDF(file.stored_filename, validRanges);

      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF splitting failed.");
    } finally {
      setProcessing(false);
    }
  }

  function resetFile() {
    setFile(null);
    setInfo(null);
    setRanges([]);
    setResult(null);
    setError("");
  }

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
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <FileText size={23} />
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Split PDF
        </h1>

        <p className="mt-2 text-sm leading-6 text-gray-500">
          Divide a PDF into separate documents by specifying page ranges. Each
          range will become an individual PDF inside a ZIP file.
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
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 bg-white hover:border-blue-300"
          }`}
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
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
                <Plus size={17} />
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
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
            }}
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
              className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
              aria-label="Remove PDF"
            >
              <Trash2 size={18} />
            </button>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900">Page ranges</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Each range creates a separate PDF.
                </p>
              </div>

              <button
                onClick={addRange}
                disabled={processing || ranges.length >= 100}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Plus size={15} />
                Add range
              </button>
            </div>

            <div className="space-y-3">
              {ranges.map((range, index) => (
                <div
                  key={range.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-blue-700">
                    {index + 1}
                  </div>

                  <div className="flex flex-1 flex-wrap items-center gap-3">
                    <label className="flex flex-1 flex-col gap-1 text-xs text-gray-500">
                      Start page
                      <input
                        type="number"
                        min={1}
                        max={info.page_count}
                        value={range.start}
                        disabled={processing}
                        onChange={(event) =>
                          updateRange(range.id, "start", event.target.value)
                        }
                        className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    <span className="mt-5 text-gray-400">to</span>

                    <label className="flex flex-1 flex-col gap-1 text-xs text-gray-500">
                      End page
                      <input
                        type="number"
                        min={1}
                        max={info.page_count}
                        value={range.end}
                        disabled={processing}
                        onChange={(event) =>
                          updateRange(range.id, "end", event.target.value)
                        }
                        className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                  </div>

                  <button
                    onClick={() => removeRange(range.id)}
                    disabled={processing || ranges.length === 1}
                    aria-label={`Remove range ${index + 1}`}
                    className="mt-5 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>

            <p className="mt-3 text-xs leading-5 text-gray-400">
              Page numbers are 1-based. Overlapping ranges are allowed and will
              produce separate PDFs containing those pages.
            </p>
          </div>

          <button
            onClick={handleSplit}
            disabled={processing || uploading || ranges.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Splitting PDF...
              </>
            ) : (
              <>
                <FileText size={18} />
                Split into {ranges.length} PDFs
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
                PDF split successfully
              </h2>

              <p className="mt-2 text-sm text-emerald-800">
                Created {result.parts} PDF files in a ZIP archive.
              </p>

              <p className="mt-1 text-xs text-emerald-700">
                ZIP size: {formatSize(result.output_size_bytes)}
              </p>

              <a
                href={getDownloadUrl(result.output_filename)}
                download
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                <Download size={17} />
                Download ZIP
              </a>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
