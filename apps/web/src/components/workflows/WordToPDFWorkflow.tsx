"use client";

import { FileText } from "lucide-react";

import OfficeToPDFWorkflow from "./shared/OfficeToPDFWorkflow";

export default function WordToPDFWorkflow({ onBack }: { onBack: () => void }) {
  return (
    <OfficeToPDFWorkflow
      onBack={onBack}
      kind="docx"
      label="Word"
      icon={FileText}
      mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    />
  );
}
