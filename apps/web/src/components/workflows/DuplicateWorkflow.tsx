"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

import { duplicatePages, getDownloadUrl } from "@/lib/api";

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

export default function DuplicateWorkflow({ onBack }: { onBack: () => void }) {
  const workflow = usePDFWorkflow();
  const { file, info, processing, result } = workflow;

  const [selected, setSelected] = useState<number[]>([]);
  const [page, setPage] = useState(1);

  function toggle(number: number) {
    setPage(number);
    setSelected((current) =>
      current.includes(number)
        ? current.filter((item) => item !== number)
        : [...current, number].sort((a, b) => a - b),
    );
    workflow.clearResult();
  }

  return (
    <WorkflowShell
      icon={Copy}
      title="Duplicate Pages"
      description="Pick the pages to copy. Each copy is placed directly after its original."
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
              setSelected([]);
              setPage(1);
            }}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <PagePreview
              filename={file.stored_filename}
              pageCount={info.page_count}
              page={page}
              onPageChange={setPage}
            />

            <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">
                  Pages to duplicate
                </h2>
                <span className="text-sm text-gray-500">
                  {selected.length} selected
                </span>
              </div>

              <div className="mt-4 grid max-h-72 grid-cols-6 gap-2 overflow-y-auto sm:grid-cols-8">
                {Array.from({ length: info.page_count }, (_, index) => {
                  const number = index + 1;
                  const active = selected.includes(number);

                  return (
                    <button
                      key={number}
                      type="button"
                      disabled={processing}
                      aria-pressed={active}
                      onClick={() => toggle(number)}
                      className={`h-10 rounded-lg border text-sm font-medium transition ${
                        active
                          ? "border-violet-600 bg-violet-600 text-white"
                          : "border-gray-200 text-gray-700 hover:border-violet-300"
                      }`}
                    >
                      {number}
                    </button>
                  );
                })}
              </div>

              <p className="mt-4 text-xs text-gray-400">
                Result: {info.page_count + selected.length} pages.
              </p>
            </div>
          </div>

          <SubmitButton
            label="Duplicate pages"
            busyLabel="Duplicating..."
            icon={Copy}
            busy={processing}
            disabled={selected.length === 0}
            onClick={() =>
              void workflow.run((filename) => duplicatePages(filename, selected))
            }
          />
        </section>
      )}

      <ErrorBanner message={workflow.error} />

      {result && file && (
        <ResultCard
          title="Pages duplicated"
          detail={`${result.page_count} pages · ${formatSize(result.output_size_bytes)}`}
          href={getDownloadUrl(
            result.output_filename,
            `${file.original_filename.replace(/\.pdf$/i, "")}-duplicated.pdf`,
          )}
          downloadLabel="Download PDF"
        />
      )}
    </WorkflowShell>
  );
}
