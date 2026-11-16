"use client";

import { FileSpreadsheet } from "lucide-react";

import { pdfToXlsx } from "@/lib/api";

import ConvertWorkflow from "./shared/ConvertWorkflow";

export default function PDFToExcelWorkflow({ onBack }: { onBack: () => void }) {
  return (
    <ConvertWorkflow
      onBack={onBack}
      icon={FileSpreadsheet}
      title="PDF to Excel"
      description="Extract the tables from a PDF into an Excel (.xlsx) workbook."
      note="Each table becomes its own sheet. If no tables are detected, the page text is exported instead. Table detection is best-effort."
      buttonLabel="Convert to Excel"
      busyLabel="Extracting tables..."
      resultTitle="Converted to Excel"
      downloadName={(name) => `${name}.xlsx`}
      resultDetail={(result) =>
        result.tables_extracted
          ? `${result.tables_extracted} table${result.tables_extracted === 1 ? "" : "s"} extracted`
          : "No tables found, page text exported"
      }
      convert={pdfToXlsx}
    />
  );
}
