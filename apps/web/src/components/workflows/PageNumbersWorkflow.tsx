"use client";

import { useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Hash,
  Loader2,
  Upload,
  X,
} from "lucide-react";

import {
  getDownloadUrl,
  inspectPDF,
  numberPDFPages,
  uploadPDF,
  type PDFInfo,
  type PDFOperationResponse,
  type UploadedPDF,
} from "@/lib/api";

interface PageNumbersWorkflowProps {
  onBack: () => void;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const POSITIONS = [
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "top-center", label: "Top center" },
  { value: "top-right", label: "Top right" },
] as const;

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function PageNumbersWorkflow({
  onBack,
}: PageNumbersWorkflowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<UploadedPDF | null>(null);
  const [info, setInfo] = useState<PDFInfo | null>(null);
  const [position, setPosition] = useState<string>("bottom-center");
  const [fontSize, setFontSize] = useState(10);
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
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not upload or inspect PDF.",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleAddNumbers() {
    if (!file) return;

    setError("");
    setResult(null);
    setProcessing(true);

    try {
      const response = await numberPDFPages(
        file.stored_filename,
        position,
        fontSize,
      );

      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Page numbering failed.");
    } finally {
      setProcessing(false);
    }
  }

  function resetFile() {
    setFile(null);
    setInfo(null);
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
          <Hash size={23} />
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Add Page Numbers
        </h1>

        <p className="mt-2 text-sm leading-6 text-gray-500">
          Automatically number every page in your PDF with your preferred
          placement and font size.
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
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
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
              <X size={18} />
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
            <h2 className="font-semibold text-gray-900">Numbering settings</h2>
            <p className="mt-1 text-sm text-gray-500">
              Configure where page numbers appear.
            </p>

            <label className="mb-3 mt-6 block text-sm font-medium text-gray-700">
              Position
            </label>

            <div className="grid grid-cols-2 gap-3">
              {POSITIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setPosition(option.value);
                    setResult(null);
                    setError("");
                  }}
                  disabled={processing}
                  className={`rounded-xl border p-4 text-sm font-medium transition ${
                    position === option.value
                      ? "border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-100"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mt-7">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Font size
                </label>
                <span className="text-sm font-semibold text-blue-700">
                  {fontSize} pt
                </span>
              </div>

              <input
                type="range"
                min="6"
                max="36"
                step="1"
                value={fontSize}
                disabled={processing}
                onChange={(event) => {
                  setFontSize(Number(event.target.value));
                  setResult(null);
                }}
                className="mt-4 w-full accent-blue-600"
              />

              <div className="flex justify-between text-xs text-gray-400">
                <span>6 pt</span>
                <span>36 pt</span>
              </div>
            </div>

            <div className="mt-7 rounded-xl border border-gray-200 bg-gray-50 p-6">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Preview
              </p>

              <div className="relative mx-auto flex aspect-4/3 max-w-sm items-center justify-center rounded-md border border-gray-200 bg-white shadow-sm">
                <span className="text-xs text-gray-300">PDF page preview</span>

                <span
                  className="absolute font-medium text-gray-700"
                  style={{
                    fontSize: `${Math.min(fontSize, 24)}px`,
                    ...(position.startsWith("bottom")
                      ? { bottom: "12px" }
                      : { top: "12px" }),
                    ...(position.endsWith("center")
                      ? { left: "50%", transform: "translateX(-50%)" }
                      : { right: "20px" }),
                  }}
                >
                  1
                </span>
              </div>

              <p className="mt-3 text-center text-xs text-gray-400">
                Approximate preview of the selected page number placement.
              </p>
            </div>

            <div className="mt-5 rounded-xl bg-blue-50 p-4 text-sm text-blue-800">
              Page numbering starts at 1 and continues sequentially through all{" "}
              {info.page_count} pages.
            </div>
          </div>

          <button
            onClick={handleAddNumbers}
            disabled={processing}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Adding page numbers...
              </>
            ) : (
              <>
                <Hash size={18} />
                Add page numbers
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
                Page numbers added successfully
              </h2>

              <p className="mt-2 text-sm text-emerald-800">
                Added numbering to {result.page_count} pages.
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
                Download numbered PDF
              </a>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
