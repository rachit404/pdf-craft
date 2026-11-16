"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { getDownloadUrl, type ConversionResponse } from "@/lib/api";

import PDFDropzone from "./PDFDropzone";
import { usePDFWorkflow } from "./usePDFWorkflow";
import {
  ErrorBanner,
  FileChip,
  formatSize,
  Notice,
  ResultCard,
  SubmitButton,
  WorkflowShell,
} from "./ui";

export interface ConvertWorkflowProps {
  onBack: () => void;
  icon: LucideIcon;
  title: string;
  description: string;
  /** Caveat shown above the button, e.g. about conversion quality. */
  note?: ReactNode;
  buttonLabel: string;
  busyLabel: string;
  resultTitle: string;
  /** File name offered for download, derived from the source PDF's name. */
  downloadName: (baseName: string) => string;
  resultDetail: (result: ConversionResponse) => string;
  convert: (filename: string) => Promise<ConversionResponse>;
  /** Settings UI; call `changed` from handlers so a stale result is hidden. */
  options?: (controls: { disabled: boolean; changed: () => void }) => ReactNode;
}

/** One PDF in → one converted file out. Used by the PDF to X tools. */
export default function ConvertWorkflow({
  onBack,
  icon,
  title,
  description,
  note,
  buttonLabel,
  busyLabel,
  resultTitle,
  downloadName,
  resultDetail,
  convert,
  options,
}: ConvertWorkflowProps) {
  const workflow = usePDFWorkflow<ConversionResponse>();
  const { file, info, processing, result } = workflow;

  return (
    <WorkflowShell
      icon={icon}
      title={title}
      description={description}
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

          {options && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
              {options({
                disabled: processing,
                changed: workflow.clearResult,
              })}
            </div>
          )}

          {note && <Notice>{note}</Notice>}

          <SubmitButton
            label={buttonLabel}
            busyLabel={busyLabel}
            icon={icon}
            busy={processing}
            onClick={() => void workflow.run(convert)}
          />
        </section>
      )}

      <ErrorBanner message={workflow.error} />

      {result && file && (
        <ResultCard
          title={resultTitle}
          detail={`${resultDetail(result)} · ${formatSize(result.output_size_bytes)}`}
          href={getDownloadUrl(
            result.output_filename,
            downloadName(file.original_filename.replace(/\.pdf$/i, "")),
          )}
          downloadLabel="Download"
        />
      )}
    </WorkflowShell>
  );
}
