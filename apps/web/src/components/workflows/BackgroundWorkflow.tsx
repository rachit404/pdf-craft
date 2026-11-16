"use client";

import { useState } from "react";
import { PaintBucket } from "lucide-react";

import { addBackground, getDownloadUrl } from "@/lib/api";

import PagePreview from "./shared/PagePreview";
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

const PRESETS = [
  { name: "Cream", value: "#fff8dc" },
  { name: "Sky", value: "#e0f2fe" },
  { name: "Mint", value: "#dcfce7" },
  { name: "Rose", value: "#fee2e2" },
  { name: "Lavender", value: "#ede9fe" },
  { name: "Slate", value: "#e2e8f0" },
];

/** "#rrggbb" → 0–1 channels, as the API expects. */
function toChannels(hex: string): [number, number, number] {
  const [red, green, blue] = [1, 3, 5].map((start) =>
    Number((parseInt(hex.slice(start, start + 2), 16) / 255).toFixed(4)),
  );

  return [red, green, blue];
}

export default function BackgroundWorkflow({ onBack }: { onBack: () => void }) {
  const workflow = usePDFWorkflow();
  const { file, info, processing, result } = workflow;

  const [color, setColor] = useState(PRESETS[0].value);
  const [page, setPage] = useState(1);

  function pick(value: string) {
    setColor(value);
    workflow.clearResult();
  }

  return (
    <WorkflowShell
      icon={PaintBucket}
      title="Background"
      description="Fill every page with a background colour, placed behind your existing content."
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
            onRemove={() => {
              workflow.reset();
              setPage(1);
            }}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <PagePreview
              filename={file.stored_filename}
              pageCount={info.page_count}
              page={page}
              onPageChange={setPage}
              tint={color}
            />

            <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="background-color"
                  className="text-sm font-medium text-gray-700"
                >
                  Colour
                </label>
                <input
                  id="background-color"
                  type="color"
                  value={color}
                  disabled={processing}
                  onChange={(event) => pick(event.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    disabled={processing}
                    aria-pressed={color === preset.value}
                    onClick={() => pick(preset.value)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm text-gray-700 transition ${
                      color === preset.value
                        ? "border-violet-400 ring-4 ring-violet-100"
                        : "border-gray-200 hover:border-violet-200"
                    }`}
                  >
                    <span
                      className="h-5 w-5 shrink-0 rounded-full border border-gray-200"
                      style={{ backgroundColor: preset.value }}
                    />
                    {preset.name}
                  </button>
                ))}
              </div>

              <p className="text-xs text-gray-400">
                Pages that already have an opaque white fill will hide the
                background. The preview is an approximation.
              </p>
            </div>
          </div>

          <SubmitButton
            label="Apply background"
            busyLabel="Applying background..."
            icon={PaintBucket}
            busy={processing}
            onClick={() =>
              void workflow.run((filename) =>
                addBackground(filename, ...toChannels(color)),
              )
            }
          />
        </section>
      )}

      <ErrorBanner message={workflow.error} />

      {result && (
        <ResultCard
          title="Background applied"
          detail={`${result.page_count} pages · ${formatSize(result.output_size_bytes)}`}
          href={getDownloadUrl(result.output_filename)}
          downloadLabel="Download PDF"
        />
      )}
    </WorkflowShell>
  );
}
