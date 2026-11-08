"use client";

import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpDown,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  getDownloadUrl,
  inspectPDF,
  reorderPDF,
  uploadPDF,
  type PDFInfo,
  type PDFOperationResponse,
  type UploadedPDF,
} from "@/lib/api";

interface ReorderWorkflowProps {
  onBack: () => void;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function parsePageOrder(value: string, totalPages: number): number[] {
  const tokens = value.split(",").map((item) => item.trim());

  if (!value.trim() || tokens.some((token) => !token)) {
    throw new Error("Enter the page order, for example 3,1,2,4.");
  }

  const order = tokens.map((token) => {
    if (!/^\d+$/.test(token)) {
      throw new Error(`Invalid page number: "${token}".`);
    }

    return Number(token);
  });

  if (order.length !== totalPages) {
    throw new Error(`You must include all ${totalPages} pages exactly once.`);
  }

  if (order.some((page) => page < 1 || page > totalPages)) {
    throw new Error(`Page numbers must be between 1 and ${totalPages}.`);
  }

  if (new Set(order).size !== totalPages) {
    throw new Error("Duplicate page numbers are not allowed.");
  }

  return order;
}

export default function ReorderWorkflow({ onBack }: ReorderWorkflowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<UploadedPDF | null>(null);
  const [info, setInfo] = useState<PDFInfo | null>(null);
  const [orderInput, setOrderInput] = useState("");
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
    setOrderInput("");

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

      setFile(uploaded);
      setInfo(pdfInfo);
      setOrderInput(
        Array.from(
          { length: pdfInfo.page_count },
          (_, index) => index + 1,
        ).join(","),
      );
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

  function updateOrder(value: string) {
    setOrderInput(value);
    setResult(null);
    setError("");
  }

  function resetFile() {
    setFile(null);
    setInfo(null);
    setOrderInput("");
    setResult(null);
    setError("");
  }

  function restoreOriginalOrder() {
    if (!info) return;

    updateOrder(
      Array.from({ length: info.page_count }, (_, index) => index + 1).join(
        ",",
      ),
    );
  }

  function reverseOrder() {
    if (!info) return;

    updateOrder(
      Array.from(
        { length: info.page_count },
        (_, index) => info.page_count - index,
      ).join(","),
    );
  }

  async function handleReorder() {
    if (!file || !info) return;

    let order: number[];

    try {
      order = parsePageOrder(orderInput, info.page_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid page order.");
      return;
    }

    setError("");
    setResult(null);
    setProcessing(true);

    try {
      const response = await reorderPDF(file.stored_filename, order);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Page reordering failed.");
    } finally {
      setProcessing(false);
    }
  }

  let previewOrder: number[] = [];
  let previewError = "";

  if (info && orderInput.trim()) {
    try {
      previewOrder = parsePageOrder(orderInput, info.page_count);
    } catch (err) {
      previewError = err instanceof Error ? err.message : "Invalid page order.";
    }
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
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
          <ArrowUpDown size={23} />
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Reorder PDF pages
        </h1>

        <p className="mt-2 text-sm leading-6 text-gray-500">
          Arrange all pages in your preferred order and download the reorganized
          PDF.
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
              ? "border-orange-500 bg-orange-50"
              : "border-gray-300 bg-white hover:border-orange-300"
          }`}
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
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
              aria-label="Remove PDF"
              className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
            >
              <Trash2 size={18} />
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
            <div className="mb-5">
              <h2 className="font-semibold text-gray-900">
                Set your page order
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Enter every page number once, in the order you want them to
                appear.
              </p>
            </div>

            <label className="mb-2 block text-sm font-medium text-gray-700">
              New page order
            </label>

            <input
              type="text"
              value={orderInput}
              disabled={processing}
              onChange={(event) => updateOrder(event.target.value)}
              placeholder="Example: 3,1,2,4"
              className="h-12 w-full rounded-xl border border-gray-200 px-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-gray-400">
                Required: all pages from 1 to {info.page_count}
              </p>

              <div className="flex gap-4">
                <button
                  onClick={restoreOriginalOrder}
                  disabled={processing}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
                >
                  <RotateCcw size={13} />
                  Original order
                </button>

                <button
                  onClick={reverseOrder}
                  disabled={processing}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 hover:text-orange-800"
                >
                  <RotateCw size={13} />
                  Reverse
                </button>
              </div>
            </div>

            <div className="mt-6 rounded-xl bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-gray-700">
                  New page sequence
                </p>

                <span className="text-xs text-gray-400">
                  {previewOrder.length
                    ? `${previewOrder.length} pages`
                    : "Waiting for valid order"}
                </span>
              </div>

              {previewOrder.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {previewOrder.map((page, index) => (
                    <div
                      key={`${page}-${index}`}
                      className="flex h-12 w-10 flex-col items-center justify-center rounded-lg border border-orange-200 bg-white"
                    >
                      <span className="text-sm font-bold text-gray-900">
                        {page}
                      </span>
                      <span className="text-[9px] text-gray-400">
                        {index + 1}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-gray-400">
                  Enter a valid sequence to see the preview.
                </p>
              )}

              {previewError && (
                <p className="mt-3 text-xs text-red-600">{previewError}</p>
              )}
            </div>

            <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-xs font-semibold text-blue-900">Example</p>
              <p className="mt-2 text-xs leading-5 text-blue-800">
                Original: 1, 2, 3, 4
                <br />
                New order: 3, 1, 2, 4
                <br />
                Result: Original page 3 becomes the first page.
              </p>
            </div>
          </div>

          <button
            onClick={handleReorder}
            disabled={
              processing || uploading || !!previewError || !orderInput.trim()
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-4 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Reordering pages...
              </>
            ) : (
              <>
                <ArrowUpDown size={18} />
                Reorder pages
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
                Pages reordered successfully
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
                Download reordered PDF
              </a>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
