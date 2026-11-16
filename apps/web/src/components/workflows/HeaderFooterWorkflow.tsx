"use client";

import { useState } from "react";
import { Heading } from "lucide-react";

import { addHeaderFooter, getDownloadUrl } from "@/lib/api";

import PagePreview from "./shared/PagePreview";
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

// Matches the backend: 9 pt Helvetica centred, baselines 20 pt from the top
// and 15 pt from the bottom edge.
const FONT_SIZE = 9;
const HEADER_BASELINE = 20;
const FOOTER_BASELINE = 15;

export default function HeaderFooterWorkflow({
  onBack,
}: {
  onBack: () => void;
}) {
  const workflow = usePDFWorkflow();
  const { file, info, processing, result } = workflow;

  const [header, setHeader] = useState("");
  const [footer, setFooter] = useState("");
  const [page, setPage] = useState(1);

  const hasContent = Boolean(header.trim() || footer.trim());

  function edit(setter: (value: string) => void, value: string) {
    setter(value);
    workflow.clearResult();
  }

  function handleSubmit() {
    void workflow.run((filename) =>
      addHeaderFooter(filename, header.trim() || null, footer.trim() || null),
    );
  }

  return (
    <WorkflowShell
      icon={Heading}
      title="Header & Footer"
      description="Add a centred header and footer to every page of your PDF."
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
            >
              {(size) => {
                const line = (text: string, baseline: number, fromTop: boolean) =>
                  text.trim() && (
                    <div
                      className="absolute left-1/2 whitespace-nowrap text-black"
                      style={{
                        top: `${((fromTop ? baseline : size.height - baseline) / size.height) * 100}%`,
                        fontSize: `${(FONT_SIZE / size.width) * 100}cqw`,
                        lineHeight: 1.2,
                        fontFamily: "Helvetica, Arial, sans-serif",
                        transform: "translate(-50%, -0.95em)",
                      }}
                    >
                      {text}
                    </div>
                  );

                return (
                  <>
                    {line(header, HEADER_BASELINE, true)}
                    {line(footer, FOOTER_BASELINE, false)}
                  </>
                );
              }}
            </PagePreview>

            <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
              {[
                { id: "header", label: "Header", value: header, set: setHeader },
                { id: "footer", label: "Footer", value: footer, set: setFooter },
              ].map((field) => (
                <div key={field.id}>
                  <label
                    htmlFor={field.id}
                    className="mb-2 block text-sm font-medium text-gray-700"
                  >
                    {field.label}
                  </label>
                  <input
                    id={field.id}
                    type="text"
                    value={field.value}
                    maxLength={200}
                    disabled={processing}
                    placeholder={`${field.label} text (optional)`}
                    onChange={(event) => edit(field.set, event.target.value)}
                    className={inputClass}
                  />
                  <p className="mt-1 text-right text-xs text-gray-400">
                    {field.value.length}/200
                  </p>
                </div>
              ))}

              <p className="text-xs text-gray-400">
                Latin characters only. Leave one field empty to add just a
                header or just a footer.
              </p>
            </div>
          </div>

          <SubmitButton
            label="Add header & footer"
            busyLabel="Applying..."
            icon={Heading}
            busy={processing}
            disabled={!hasContent}
            onClick={handleSubmit}
          />
        </section>
      )}

      <ErrorBanner message={workflow.error} />

      {result && (
        <ResultCard
          title="Header & footer added"
          detail={`${result.page_count} pages · ${formatSize(result.output_size_bytes)}`}
          href={getDownloadUrl(result.output_filename)}
          downloadLabel="Download PDF"
        />
      )}
    </WorkflowShell>
  );
}
