"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

import {
  getDownloadUrl,
  sanitizePDF,
  type SanitizeOptions,
  type SanitizeResponse,
} from "@/lib/api";

import PDFDropzone from "./shared/PDFDropzone";
import { usePDFWorkflow } from "./shared/usePDFWorkflow";
import {
  ErrorBanner,
  FileChip,
  formatSize,
  Notice,
  ResultCard,
  SubmitButton,
  ToggleRow,
  WorkflowShell,
} from "./shared/ui";

const OPTIONS: {
  key: keyof SanitizeOptions;
  label: string;
  description: string;
}[] = [
  {
    key: "metadata",
    label: "Document metadata",
    description: "Title, author, creator, dates and embedded XMP information.",
  },
  {
    key: "javascript",
    label: "JavaScript and auto-run actions",
    description: "Scripts and actions that run when the file or a page opens.",
  },
  {
    key: "attachments",
    label: "Attached files",
    description: "Files embedded inside the PDF.",
  },
  {
    key: "annotations",
    label: "Comments and annotations",
    description: "Sticky notes, highlights and other markup, with replies.",
  },
  {
    key: "links",
    label: "Links",
    description: "Clickable links to websites and other documents.",
  },
  {
    key: "hiddenText",
    label: "Hidden text",
    description:
      "Invisible text such as white-on-white. Also removes the invisible text layer of OCR scans.",
  },
  {
    key: "formData",
    label: "Form field values",
    description: "Resets filled-in forms to their empty state.",
  },
];

const ALL_ON: SanitizeOptions = {
  metadata: true,
  javascript: true,
  attachments: true,
  annotations: true,
  links: true,
  hiddenText: true,
  formData: true,
};

function summary(result: SanitizeResponse): string {
  const parts = [
    result.metadata_removed && "metadata",
    result.attachments_removed > 0 &&
      `${result.attachments_removed} attachment${result.attachments_removed === 1 ? "" : "s"}`,
    result.annotations_removed > 0 &&
      `${result.annotations_removed} annotation${result.annotations_removed === 1 ? "" : "s"}`,
    result.links_removed > 0 &&
      `${result.links_removed} link${result.links_removed === 1 ? "" : "s"}`,
  ].filter(Boolean);

  return parts.length
    ? `Removed ${parts.join(", ")}`
    : "Nothing needed removing, but the file was cleaned and rewritten";
}

export default function SanitizeWorkflow({ onBack }: { onBack: () => void }) {
  const workflow = usePDFWorkflow<SanitizeResponse>();
  const { file, info, processing, result } = workflow;

  const [options, setOptions] = useState<SanitizeOptions>(ALL_ON);

  const anySelected = Object.values(options).some(Boolean);

  return (
    <WorkflowShell
      icon={ShieldCheck}
      title="Sanitize PDF"
      description="Strip hidden data and potentially unsafe content before sharing a document."
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

          <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
            <h2 className="font-semibold text-gray-900">What to remove</h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {OPTIONS.map((option) => (
                <ToggleRow
                  key={option.key}
                  label={option.label}
                  description={option.description}
                  checked={options[option.key]}
                  disabled={processing}
                  onChange={(checked) => {
                    setOptions((current) => ({
                      ...current,
                      [option.key]: checked,
                    }));
                    workflow.clearResult();
                  }}
                />
              ))}
            </div>
          </div>

          <Notice>
            The visible page content is kept as it is. To remove specific text
            or images, use Redact PDF first, then sanitize the result.
          </Notice>

          <SubmitButton
            label="Sanitize PDF"
            busyLabel="Sanitizing..."
            icon={ShieldCheck}
            busy={processing}
            disabled={!anySelected}
            onClick={() =>
              void workflow.run((filename) => sanitizePDF(filename, options))
            }
          />
        </section>
      )}

      <ErrorBanner message={workflow.error} />

      {result && file && (
        <ResultCard
          title="PDF sanitized"
          detail={`${summary(result)} · ${formatSize(result.output_size_bytes)}`}
          href={getDownloadUrl(
            result.output_filename,
            `${file.original_filename.replace(/\.pdf$/i, "")}-sanitized.pdf`,
          )}
          downloadLabel="Download sanitized PDF"
        />
      )}
    </WorkflowShell>
  );
}
