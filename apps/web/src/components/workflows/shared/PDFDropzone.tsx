"use client";

import FileDropzone from "./FileDropzone";
import { MAX_PDF_BYTES, type usePDFWorkflow } from "./usePDFWorkflow";

export default function PDFDropzone({
  workflow,
}: {
  workflow: ReturnType<typeof usePDFWorkflow>;
}) {
  return (
    <FileDropzone
      title="Drop your PDF here"
      hint="PDF only · Maximum 25 MB"
      accept=".pdf,application/pdf"
      extensions={[".pdf"]}
      maxBytes={MAX_PDF_BYTES}
      busy={workflow.uploading}
      busyLabel="Uploading and inspecting PDF..."
      buttonLabel="Select PDF"
      onSelect={(file) => void workflow.upload(file)}
      onError={workflow.setError}
    />
  );
}
