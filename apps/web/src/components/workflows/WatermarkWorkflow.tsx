"use client";

import { useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Stamp,
  Upload,
  X,
} from "lucide-react";

import {
  getDownloadUrl,
  inspectPDF,
  uploadPDF,
  watermarkPDF,
  type PDFInfo,
  type PDFOperationResponse,
  type UploadedPDF,
} from "@/lib/api";

interface WatermarkWorkflowProps {
  onBack: () => void;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function WatermarkWorkflow({ onBack }: WatermarkWorkflowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<UploadedPDF | null>(null);
  const [info, setInfo] = useState<PDFInfo | null>(null);
  const [text, setText] = useState("CONFIDENTIAL");
  const [opacity, setOpacity] = useState(0.25);
  const [fontSize, setFontSize] = useState(48);
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

  async function handleWatermark() {
    if (!file || !text.trim()) {
      setError("Enter watermark text before continuing.");
      return;
    }

    setError("");
    setResult(null);
    setProcessing(true);

    try {
      const response = await watermarkPDF(
        file.stored_filename,
        text.trim(),
        opacity,
        fontSize,
      );

      setResult(response);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Watermark operation failed.",
      );
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
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
          <Stamp size={23} />
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Add Watermark
        </h1>

        <p className="mt-2 text-sm leading-6 text-gray-500">
          Apply a diagonal text watermark to every page of your PDF.
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
              ? "border-violet-500 bg-violet-50"
              : "border-gray-300 bg-white hover:border-violet-300"
          }`}
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
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
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
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
            <h2 className="font-semibold text-gray-900">Watermark settings</h2>
            <p className="mt-1 text-sm text-gray-500">
              Customize how the watermark appears on your document.
            </p>

            <label className="mb-2 mt-5 block text-sm font-medium text-gray-700">
              Watermark text
            </label>

            <input
              type="text"
              value={text}
              maxLength={150}
              disabled={processing}
              onChange={(event) => {
                setText(event.target.value);
                setResult(null);
                setError("");
              }}
              placeholder="Enter watermark text"
              className="h-12 w-full rounded-xl border border-gray-200 px-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            />

            <div className="mt-2 text-right text-xs text-gray-400">
              {text.length}/150 characters
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Opacity
                </label>
                <span className="text-sm font-semibold text-violet-700">
                  {Math.round(opacity * 100)}%
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={opacity}
                disabled={processing}
                onChange={(event) => {
                  setOpacity(Number(event.target.value));
                  setResult(null);
                }}
                className="mt-4 w-full accent-violet-600"
              />

              <div className="flex justify-between text-xs text-gray-400">
                <span>Transparent</span>
                <span>Opaque</span>
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Font size
                </label>
                <span className="text-sm font-semibold text-violet-700">
                  {fontSize}px
                </span>
              </div>

              <input
                type="range"
                min="8"
                max="150"
                step="1"
                value={fontSize}
                disabled={processing}
                onChange={(event) => {
                  setFontSize(Number(event.target.value));
                  setResult(null);
                }}
                className="mt-4 w-full accent-violet-600"
              />

              <div className="flex justify-between text-xs text-gray-400">
                <span>8</span>
                <span>150</span>
              </div>
            </div>

            <div className="mt-7 rounded-xl border border-gray-200 bg-gray-50 p-6">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Preview
              </p>

              <div className="relative mx-auto flex aspect-4/3 max-w-sm items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
                <span
                  className="select-none whitespace-nowrap font-bold text-gray-500"
                  style={{
                    opacity,
                    fontSize: `${Math.min(fontSize, 44)}px`,
                    transform: "rotate(-35deg)",
                  }}
                >
                  {text.trim() || "YOUR WATERMARK"}
                </span>
              </div>

              <p className="mt-3 text-center text-xs text-gray-400">
                Approximate preview. The backend applies the watermark
                diagonally to every PDF page.
              </p>
            </div>
          </div>

          <button
            onClick={handleWatermark}
            disabled={processing || !text.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-4 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Applying watermark...
              </>
            ) : (
              <>
                <Stamp size={18} />
                Apply watermark
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
                Watermark applied successfully
              </h2>

              <p className="mt-2 text-sm text-emerald-800">
                Watermark added to {result.page_count} pages.
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
                Download watermarked PDF
              </a>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
