"use client";

import { Info } from "lucide-react";

import type { PDFInfo } from "@/lib/api";

import PDFDropzone from "./shared/PDFDropzone";
import { usePDFWorkflow } from "./shared/usePDFWorkflow";
import {
  ErrorBanner,
  FileChip,
  formatSize,
  Notice,
  WorkflowShell,
} from "./shared/ui";

const POINTS_PER_MM = 72 / 25.4;

function pageSize(info: PDFInfo): string {
  if (!info.page_size) return "Unknown";

  const { width, height } = info.page_size;
  const millimetres = `${Math.round(width / POINTS_PER_MM)} × ${Math.round(height / POINTS_PER_MM)} mm`;

  return `${millimetres} (${Math.round(width)} × ${Math.round(height)} pt)${
    info.mixed_page_sizes ? ", first page; sizes vary" : ""
  }`;
}

function date(value: string | null): string | null {
  if (!value) return null;

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function InfoWorkflow({ onBack }: { onBack: () => void }) {
  const workflow = usePDFWorkflow();
  const { file, info } = workflow;

  const rows: [string, string | null][] = info
    ? [
        ["Pages", String(info.page_count)],
        ["File size", formatSize(info.size_bytes)],
        ["Page size", pageSize(info)],
        ["PDF version", info.pdf_version],
        ["Title", info.metadata.title],
        ["Author", info.metadata.author],
        ["Subject", info.metadata.subject],
        ["Keywords", info.metadata.keywords],
        ["Created with", info.metadata.creator],
        ["PDF producer", info.metadata.producer],
        ["Created", date(info.metadata.created)],
        ["Modified", date(info.metadata.modified)],
      ]
    : [];

  return (
    <WorkflowShell
      icon={Info}
      title="PDF Details"
      description="See what a PDF contains and which metadata travels with it."
      onBack={onBack}
    >
      {!file || !info ? (
        <PDFDropzone workflow={workflow} />
      ) : (
        <section className="space-y-6">
          <FileChip
            name={file.original_filename}
            detail={`${formatSize(file.size_bytes)} · ${info.page_count} pages`}
            onRemove={workflow.reset}
          />

          <dl className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
            {rows.map(([label, value]) => (
              <div
                key={label}
                className="grid grid-cols-3 gap-4 px-5 py-3 text-sm sm:px-6"
              >
                <dt className="font-medium text-gray-500">{label}</dt>
                <dd
                  className={`col-span-2 break-words ${
                    value ? "text-gray-900" : "text-gray-400"
                  }`}
                >
                  {value || "Not set"}
                </dd>
              </div>
            ))}
          </dl>

          <Notice>
            Metadata such as the author and the software used is shared with
            anyone who receives the file. Use Sanitize PDF to remove it.
          </Notice>
        </section>
      )}

      <ErrorBanner message={workflow.error} />
    </WorkflowShell>
  );
}
