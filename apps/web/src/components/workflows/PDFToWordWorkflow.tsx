"use client";

import { FileText } from "lucide-react";

import { pdfToDocx } from "@/lib/api";

import ConvertWorkflow from "./shared/ConvertWorkflow";

export default function PDFToWordWorkflow({ onBack }: { onBack: () => void }) {
  return (
    <ConvertWorkflow
      onBack={onBack}
      icon={FileText}
      title="PDF to Word"
      description="Convert a PDF into an editable Word (.docx) document."
      note="Best-effort conversion: text, images and simple tables are rebuilt, but complex layouts may shift. Scanned PDFs contain no text to convert."
      buttonLabel="Convert to Word"
      busyLabel="Converting..."
      resultTitle="Converted to Word"
      downloadName={(name) => `${name}.docx`}
      resultDetail={() => "Word document"}
      convert={pdfToDocx}
    />
  );
}
