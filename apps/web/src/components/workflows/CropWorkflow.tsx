"use client";

import { useState } from "react";
import { Crop } from "lucide-react";

import { cropPDF, getDownloadUrl, type CropMargins } from "@/lib/api";

import PagePreview, { type PageSize } from "./shared/PagePreview";
import PDFDropzone from "./shared/PDFDropzone";
import { usePDFWorkflow } from "./shared/usePDFWorkflow";
import {
  ErrorBanner,
  FileChip,
  formatSize,
  inputClass,
  ResultCard,
  SubmitButton,
  WorkflowShell,
} from "./shared/ui";

type Side = keyof CropMargins;

const SIDES: { id: Side; label: string }[] = [
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
];

export default function CropWorkflow({ onBack }: { onBack: () => void }) {
  const workflow = usePDFWorkflow();
  const { file, info, processing, result } = workflow;

  // Kept as strings so the fields can be cleared while typing.
  const [values, setValues] = useState<Record<Side, string>>({
    top: "0",
    bottom: "0",
    left: "0",
    right: "0",
  });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<PageSize | null>(null);

  const margins: CropMargins = {
    top: Number(values.top) || 0,
    bottom: Number(values.bottom) || 0,
    left: Number(values.left) || 0,
    right: Number(values.right) || 0,
  };

  const invalid = Object.values(margins).some((value) => value < 0);
  const emptiesPage =
    size !== null &&
    (margins.left + margins.right >= size.width ||
      margins.top + margins.bottom >= size.height);
  const unchanged = Object.values(margins).every((value) => value === 0);

  const problem = invalid
    ? "Margins cannot be negative."
    : emptiesPage
      ? "These margins leave no visible page area."
      : "";

  function handleChange(side: Side, value: string) {
    setValues((previous) => ({ ...previous, [side]: value }));
    workflow.clearResult();
  }

  return (
    <WorkflowShell
      icon={Crop}
      title="Crop PDF"
      description="Trim the same margins from every page. The page content is kept and only the visible area changes."
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
              onLoad={setSize}
            >
              {(pageSize) => {
                const left = Math.min(margins.left, pageSize.width);
                const right = Math.min(margins.right, pageSize.width);
                const top = Math.min(margins.top, pageSize.height);
                const bottom = Math.min(margins.bottom, pageSize.height);

                return (
                  <div
                    className="absolute border border-dashed border-violet-600"
                    style={{
                      left: `${(left / pageSize.width) * 100}%`,
                      right: `${(right / pageSize.width) * 100}%`,
                      top: `${(top / pageSize.height) * 100}%`,
                      bottom: `${(bottom / pageSize.height) * 100}%`,
                      // Dim everything outside the kept area.
                      boxShadow: "0 0 0 100vmax rgb(17 24 39 / 0.45)",
                    }}
                  />
                );
              }}
            </PagePreview>

            <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
              <div className="grid grid-cols-2 gap-4">
                {SIDES.map((side) => (
                  <div key={side.id}>
                    <label
                      htmlFor={`crop-${side.id}`}
                      className="mb-2 block text-sm font-medium text-gray-700"
                    >
                      {side.label} (pt)
                    </label>
                    <input
                      id={`crop-${side.id}`}
                      type="number"
                      min={0}
                      step={1}
                      inputMode="decimal"
                      value={values[side.id]}
                      disabled={processing}
                      onChange={(event) => handleChange(side.id, event.target.value)}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                {size && !problem ? (
                  <>
                    Result:{" "}
                    <span className="font-semibold text-gray-900">
                      {Math.round(size.width - margins.left - margins.right)} ×{" "}
                      {Math.round(size.height - margins.top - margins.bottom)} pt
                    </span>{" "}
                    (page is {Math.round(size.width)} × {Math.round(size.height)}{" "}
                    pt)
                  </>
                ) : (
                  <span className="text-red-600">{problem || "Loading..."}</span>
                )}
              </div>

              <p className="text-xs text-gray-400">
                72 pt = 1 inch ≈ 25.4 mm. Margins are measured from the current
                visible edge of each page.
              </p>
            </div>
          </div>

          <SubmitButton
            label="Crop PDF"
            busyLabel="Cropping..."
            icon={Crop}
            busy={processing}
            disabled={Boolean(problem) || unchanged}
            onClick={() =>
              void workflow.run((filename) => cropPDF(filename, margins))
            }
          />
        </section>
      )}

      <ErrorBanner message={workflow.error} />

      {result && (
        <ResultCard
          title="PDF cropped"
          detail={`${result.page_count} pages · ${formatSize(result.output_size_bytes)}`}
          href={getDownloadUrl(result.output_filename)}
          downloadLabel="Download PDF"
        />
      )}
    </WorkflowShell>
  );
}
