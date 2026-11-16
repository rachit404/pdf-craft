"use client";

import { useState } from "react";
import { Shrink } from "lucide-react";

import {
  compressPDF,
  getDownloadUrl,
  type CompressionLevel,
  type CompressResponse,
} from "@/lib/api";

import PDFDropzone from "./shared/PDFDropzone";
import { usePDFWorkflow } from "./shared/usePDFWorkflow";
import {
  ErrorBanner,
  FileChip,
  formatSize,
  ResultCard,
  SubmitButton,
  WorkflowShell,
} from "./shared/ui";

const LEVELS: { id: CompressionLevel; name: string; description: string }[] = [
  {
    id: "lossless",
    name: "Lossless",
    description:
      "Repacks the file without changing how anything looks. Smallest saving.",
  },
  {
    id: "balanced",
    name: "Balanced",
    description:
      "Reduces images to 150 DPI. Good for screens and everyday printing.",
  },
  {
    id: "strong",
    name: "Strong",
    description:
      "Reduces images to 96 DPI at lower quality. Smallest file, visibly softer images.",
  },
];

export default function CompressWorkflow({ onBack }: { onBack: () => void }) {
  const workflow = usePDFWorkflow<CompressResponse>();
  const { file, info, processing, result } = workflow;

  const [level, setLevel] = useState<CompressionLevel>("lossless");

  return (
    <WorkflowShell
      icon={Shrink}
      title="Compress PDF"
      description="Make a PDF smaller. Text always stays sharp and selectable."
      onBack={onBack}
    >
      {!file || !info ? (
        <PDFDropzone workflow={workflow} />
      ) : (
        <section className="space-y-6">
          <FileChip
            name={file.original_filename}
            detail={`${formatSize(file.size_bytes)} · ${info.page_count} pages`}
            disabled={processing}
            onRemove={workflow.reset}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            {LEVELS.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={processing}
                aria-pressed={level === option.id}
                onClick={() => {
                  setLevel(option.id);
                  workflow.clearResult();
                }}
                className={`rounded-2xl border p-4 text-left transition ${
                  level === option.id
                    ? "border-violet-400 bg-violet-50 ring-4 ring-violet-100"
                    : "border-gray-200 bg-white hover:border-violet-200"
                }`}
              >
                <p className="font-semibold text-gray-900">{option.name}</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  {option.description}
                </p>
              </button>
            ))}
          </div>

          <SubmitButton
            label="Compress PDF"
            busyLabel="Compressing..."
            icon={Shrink}
            busy={processing}
            onClick={() =>
              void workflow.run((filename) => compressPDF(filename, level))
            }
          />
        </section>
      )}

      <ErrorBanner message={workflow.error} />

      {result && file && (
        <ResultCard
          title={
            result.saved_bytes > 0
              ? `Reduced by ${result.reduction_percent}%`
              : "Already as small as this level allows"
          }
          detail={
            result.saved_bytes > 0
              ? `${formatSize(result.original_size_bytes)} → ${formatSize(result.output_size_bytes)}`
              : `No saving at this level (${formatSize(result.output_size_bytes)}). Try a stronger level if the file has images.`
          }
          href={getDownloadUrl(
            result.output_filename,
            `${file.original_filename.replace(/\.pdf$/i, "")}-compressed.pdf`,
          )}
          downloadLabel="Download PDF"
        />
      )}
    </WorkflowShell>
  );
}
