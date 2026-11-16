"use client";

import { Presentation } from "lucide-react";

import OfficeToPDFWorkflow from "./shared/OfficeToPDFWorkflow";

export default function PowerPointToPDFWorkflow({
  onBack,
}: {
  onBack: () => void;
}) {
  return (
    <OfficeToPDFWorkflow
      onBack={onBack}
      kind="pptx"
      label="PowerPoint"
      icon={Presentation}
      mimeType="application/vnd.openxmlformats-officedocument.presentationml.presentation"
    />
  );
}
