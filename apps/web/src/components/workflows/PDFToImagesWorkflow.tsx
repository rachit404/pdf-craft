"use client";

import { useState } from "react";
import { FileImage } from "lucide-react";

import { pdfToImages } from "@/lib/api";

import ConvertWorkflow from "./shared/ConvertWorkflow";
import { inputClass } from "./shared/ui";

const FORMATS = [
  { id: "png", label: "PNG · lossless, larger files" },
  { id: "jpeg", label: "JPEG · smaller files" },
] as const;

const RESOLUTIONS = [
  { dpi: 72, label: "72 DPI · screen" },
  { dpi: 150, label: "150 DPI · standard" },
  { dpi: 200, label: "200 DPI · high" },
  { dpi: 300, label: "300 DPI · print" },
];

export default function PDFToImagesWorkflow({ onBack }: { onBack: () => void }) {
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [dpi, setDpi] = useState(150);

  return (
    <ConvertWorkflow
      onBack={onBack}
      icon={FileImage}
      title="PDF to Images"
      description="Export every page as an image, bundled into a ZIP file."
      buttonLabel="Convert to images"
      busyLabel="Rendering pages..."
      resultTitle="Pages exported"
      downloadName={(name) => `${name}-images.zip`}
      resultDetail={(result) =>
        `${result.page_count} image${result.page_count === 1 ? "" : "s"} in a ZIP`
      }
      convert={(filename) => pdfToImages(filename, format, dpi)}
      options={({ disabled, changed }) => (
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="format"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Format
            </label>
            <select
              id="format"
              value={format}
              disabled={disabled}
              onChange={(event) => {
                setFormat(event.target.value as "png" | "jpeg");
                changed();
              }}
              className={inputClass}
            >
              {FORMATS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="resolution"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Resolution
            </label>
            <select
              id="resolution"
              value={dpi}
              disabled={disabled}
              onChange={(event) => {
                setDpi(Number(event.target.value));
                changed();
              }}
              className={inputClass}
            >
              {RESOLUTIONS.map((item) => (
                <option key={item.dpi} value={item.dpi}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    />
  );
}
