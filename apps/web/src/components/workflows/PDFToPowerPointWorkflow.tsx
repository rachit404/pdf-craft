"use client";

import { useState } from "react";
import { Presentation } from "lucide-react";

import { pdfToPptx } from "@/lib/api";

import ConvertWorkflow from "./shared/ConvertWorkflow";
import { inputClass } from "./shared/ui";

const QUALITIES = [
  { dpi: 100, label: "Draft (100 DPI) · smallest file" },
  { dpi: 150, label: "Standard (150 DPI)" },
  { dpi: 200, label: "High (200 DPI)" },
  { dpi: 300, label: "Print (300 DPI) · largest file" },
];

export default function PDFToPowerPointWorkflow({
  onBack,
}: {
  onBack: () => void;
}) {
  const [dpi, setDpi] = useState(150);

  return (
    <ConvertWorkflow
      onBack={onBack}
      icon={Presentation}
      title="PDF to PowerPoint"
      description="Turn each PDF page into a PowerPoint (.pptx) slide."
      note="Each slide holds the page as a picture, so it looks identical to the PDF but the text is not editable."
      buttonLabel="Convert to PowerPoint"
      busyLabel="Building slides..."
      resultTitle="Converted to PowerPoint"
      downloadName={(name) => `${name}.pptx`}
      resultDetail={(result) => `${result.slide_count ?? result.page_count} slides`}
      convert={(filename) => pdfToPptx(filename, dpi)}
      options={({ disabled, changed }) => (
        <>
          <label
            htmlFor="quality"
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            Image quality
          </label>
          <select
            id="quality"
            value={dpi}
            disabled={disabled}
            onChange={(event) => {
              setDpi(Number(event.target.value));
              changed();
            }}
            className={inputClass}
          >
            {QUALITIES.map((quality) => (
              <option key={quality.dpi} value={quality.dpi}>
                {quality.label}
              </option>
            ))}
          </select>
        </>
      )}
    />
  );
}
