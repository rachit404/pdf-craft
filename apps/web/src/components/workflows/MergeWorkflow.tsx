"use client";

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
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
  mergePDFs,
  uploadPDF,
  type MergeResponse,
  type UploadedPDF,
} from "@/lib/api";

interface PDFItem extends UploadedPDF {
  id: string;
}

interface MergeWorkflowProps {
  onBack: () => void;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function MergeWorkflow({ onBack }: MergeWorkflowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<PDFItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MergeResponse | null>(null);

  async function addFiles(selectedFiles: FileList | File[]) {
    const incoming = Array.from(selectedFiles);

    if (!incoming.length) return;

    setError("");
    setResult(null);

    const validFiles: File[] = [];

    for (const file of incoming) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError(`${file.name}: Only PDF files are accepted.`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name}: Maximum file size is 25 MB.`);
        continue;
      }

      if (file.size === 0) {
        setError(`${file.name}: File is empty.`);
        continue;
      }

      validFiles.push(file);
    }

    if (!validFiles.length) return;

    if (files.length + validFiles.length > 20) {
      setError("You can merge a maximum of 20 PDF files.");
      return;
    }

    setUploading(true);

    try {
      const uploaded = await Promise.all(
        validFiles.map(async (file) => {
          const response = await uploadPDF(file);

          return {
            ...response,
            id: crypto.randomUUID(),
          };
        }),
      );

      setFiles((current) => [...current, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload PDFs.");
    } finally {
      setUploading(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function removeFile(id: string) {
    setFiles((current) => current.filter((file) => file.id !== id));
    setResult(null);
  }

  function moveFile(index: number, direction: -1 | 1) {
    const target = index + direction;

    if (target < 0 || target >= files.length) return;

    setFiles((current) => {
      const updated = [...current];
      [updated[index], updated[target]] = [updated[target], updated[index]];
      return updated;
    });

    setResult(null);
  }

  async function handleMerge() {
    if (files.length < 2) {
      setError("Upload at least two PDFs to merge.");
      return;
    }

    setProcessing(true);
    setError("");
    setResult(null);

    try {
      const response = await mergePDFs(
        files.map((file) => file.stored_filename),
      );

      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF merge failed.");
    } finally {
      setProcessing(false);
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
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
          <FileText size={23} />
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Merge PDF files
        </h1>

        <p className="mt-2 text-sm leading-6 text-gray-500">
          Combine multiple PDF documents into one file. Arrange them in the
          order you want before merging.
        </p>
      </div>

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
          void addFiles(event.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
          dragging
            ? "border-violet-500 bg-violet-50"
            : "border-gray-300 bg-white hover:border-violet-300"
        }`}
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
          <Upload size={25} />
        </div>

        <h2 className="font-semibold text-gray-900">
          Drop your PDF files here
        </h2>

        <p className="mt-2 text-sm text-gray-500">
          or select files from your device
        </p>

        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 size={17} className="animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Plus size={17} />
              Select PDF files
            </>
          )}
        </button>

        <p className="mt-4 text-xs text-gray-400">
          PDF only · Maximum 25 MB per file · Up to 20 files
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) {
              void addFiles(event.target.files);
            }
          }}
        />
      </div>

      {error && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <X size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {files.length > 0 && (
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Uploaded files</h2>
              <p className="mt-1 text-xs text-gray-500">
                {files.length} of 20 files · Use arrows to reorder.
              </p>
            </div>

            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading || files.length >= 20}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Plus size={15} />
              Add more
            </button>
          </div>

          <div className="space-y-3">
            {files.map((file, index) => (
              <div
                key={file.id}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                  <FileText size={20} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {file.original_filename}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {formatSize(file.size_bytes)}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveFile(index, -1)}
                    disabled={index === 0 || processing}
                    aria-label="Move file up"
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                  >
                    <ArrowUp size={17} />
                  </button>

                  <button
                    onClick={() => moveFile(index, 1)}
                    disabled={index === files.length - 1 || processing}
                    aria-label="Move file down"
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                  >
                    <ArrowDown size={17} />
                  </button>

                  <button
                    onClick={() => removeFile(file.id)}
                    disabled={processing}
                    aria-label="Remove file"
                    className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleMerge}
            disabled={files.length < 2 || uploading || processing}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-4 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Merging PDFs...
              </>
            ) : (
              <>
                <FileText size={18} />
                Merge {files.length} PDFs
              </>
            )}
          </button>
        </section>
      )}

      {result && (
        <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={23} className="shrink-0 text-emerald-600" />

            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-emerald-900">
                PDFs merged successfully
              </h2>

              <p className="mt-2 text-sm text-emerald-800">
                {result.source_count} files combined into {result.page_count}{" "}
                pages.
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
                Download merged PDF
              </a>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
