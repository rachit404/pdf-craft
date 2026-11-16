"use client";

import { useState } from "react";
import { EyeOff, X } from "lucide-react";

import {
  getDownloadUrl,
  redactPDF,
  type RedactionRegion,
  type RedactResponse,
} from "@/lib/api";

import PagePreview from "./shared/PagePreview";
import PDFDropzone from "./shared/PDFDropzone";
import { usePDFWorkflow } from "./shared/usePDFWorkflow";
import {
  ErrorBanner,
  FileChip,
  formatSize,
  inputClass,
  Notice,
  ResultCard,
  SubmitButton,
  WorkflowShell,
} from "./shared/ui";

type Region = RedactionRegion & { id: number };

const MAX_REGIONS = 500;
const MAX_TERMS = 50;

export default function RedactWorkflow({ onBack }: { onBack: () => void }) {
  const workflow = usePDFWorkflow<RedactResponse>();
  const { file, info, processing, result } = workflow;

  const [regions, setRegions] = useState<Region[]>([]);
  const [termsText, setTermsText] = useState("");
  const [page, setPage] = useState(1);
  const [nextId, setNextId] = useState(1);

  const terms = [
    ...new Set(
      termsText
        .split("\n")
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  ];

  const tooLong = terms.some((term) => term.length > 100);
  const ready = (regions.length > 0 || terms.length > 0) && !tooLong;

  function addRegion(rect: Omit<RedactionRegion, "page">) {
    if (regions.length >= MAX_REGIONS) {
      workflow.setError(`You can mark at most ${MAX_REGIONS} areas.`);
      return;
    }

    setRegions((current) => [...current, { id: nextId, page, ...rect }]);
    setNextId((id) => id + 1);
    workflow.clearResult();
  }

  function reset() {
    workflow.reset();
    setRegions([]);
    setTermsText("");
    setPage(1);
  }

  function handleSubmit() {
    if (terms.length > MAX_TERMS) {
      workflow.setError(`Use at most ${MAX_TERMS} search terms.`);
      return;
    }

    void workflow.run((filename) =>
      redactPDF(
        filename,
        regions.map(({ page: regionPage, x0, y0, x1, y1 }) => ({
          page: regionPage,
          x0,
          y0,
          x1,
          y1,
        })),
        terms,
      ),
    );
  }

  return (
    <WorkflowShell
      icon={EyeOff}
      title="Redact PDF"
      description="Permanently remove sensitive text, images and graphics. Draw boxes on the pages, or list words to find and remove everywhere."
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
            onRemove={reset}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <PagePreview
                filename={file.stored_filename}
                pageCount={info.page_count}
                page={page}
                onPageChange={setPage}
                onDrawRect={addRegion}
              >
                {(size) =>
                  regions
                    .filter((region) => region.page === page)
                    .map((region) => (
                      <div
                        key={region.id}
                        className="absolute border border-black bg-black/75"
                        style={{
                          left: `${(region.x0 / size.width) * 100}%`,
                          top: `${(region.y0 / size.height) * 100}%`,
                          width: `${((region.x1 - region.x0) / size.width) * 100}%`,
                          height: `${((region.y1 - region.y0) / size.height) * 100}%`,
                        }}
                      />
                    ))
                }
              </PagePreview>

              <p className="mt-3 text-center text-xs text-gray-400">
                Drag on the page to mark an area
              </p>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                <label
                  htmlFor="terms"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Words or phrases to remove everywhere
                </label>
                <textarea
                  id="terms"
                  rows={4}
                  value={termsText}
                  disabled={processing}
                  placeholder={"One per line, e.g.\nJane Doe\n555-0100"}
                  onChange={(event) => {
                    setTermsText(event.target.value);
                    workflow.clearResult();
                  }}
                  className={`${inputClass} h-auto resize-none py-3`}
                />
                <p className="mt-1 text-xs text-gray-400">
                  Matching ignores upper/lower case. Text inside scanned images
                  cannot be searched; mark those areas by hand.
                </p>
                {tooLong && (
                  <p className="mt-1 text-xs text-red-600">
                    Each term can be at most 100 characters.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                <h2 className="font-semibold text-gray-900">
                  Marked areas ({regions.length})
                </h2>

                {regions.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-400">
                    No areas yet. Drag on the preview to add one.
                  </p>
                ) : (
                  <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
                    {regions.map((region) => (
                      <li
                        key={region.id}
                        className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"
                      >
                        <button
                          onClick={() => setPage(region.page)}
                          className="text-left text-gray-700 hover:text-violet-700"
                        >
                          Page {region.page} ·{" "}
                          {Math.round(region.x1 - region.x0)} ×{" "}
                          {Math.round(region.y1 - region.y0)} pt
                        </button>
                        <button
                          onClick={() => {
                            setRegions((current) =>
                              current.filter((item) => item.id !== region.id),
                            );
                            workflow.clearResult();
                          }}
                          disabled={processing}
                          aria-label={`Remove area on page ${region.page}`}
                          className="rounded p-1 text-gray-400 hover:text-red-600 disabled:opacity-30"
                        >
                          <X size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <Notice tone="warning">
            Redaction permanently deletes the covered content from the file you
            download, so it cannot be recovered. Your original upload is not
            changed; keep your own copy of the original.
          </Notice>

          <SubmitButton
            label="Permanently redact"
            busyLabel="Redacting..."
            icon={EyeOff}
            busy={processing}
            disabled={!ready}
            onClick={handleSubmit}
          />
        </section>
      )}

      <ErrorBanner message={workflow.error} />

      {result && file && (
        <ResultCard
          title="Redactions applied"
          detail={`${result.areas_redacted} marked area${result.areas_redacted === 1 ? "" : "s"}, ${result.search_matches} text match${result.search_matches === 1 ? "" : "es"} removed · ${formatSize(result.output_size_bytes)}`}
          href={getDownloadUrl(
            result.output_filename,
            `${file.original_filename.replace(/\.pdf$/i, "")}-redacted.pdf`,
          )}
          downloadLabel="Download redacted PDF"
        />
      )}
    </WorkflowShell>
  );
}
