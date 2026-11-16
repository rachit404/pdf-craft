"use client";

import { useEffect, useState } from "react";
import { FileText, type LucideIcon } from "lucide-react";

import {
  getDownloadUrl,
  getOfficeEngine,
  officeToPDF,
  type ConversionResponse,
} from "@/lib/api";

import FileDropzone from "./FileDropzone";
import {
  ErrorBanner,
  FileChip,
  formatSize,
  Notice,
  ResultCard,
  SubmitButton,
  WorkflowShell,
} from "./ui";

const MAX_BYTES = 25 * 1024 * 1024;

interface OfficeToPDFWorkflowProps {
  onBack: () => void;
  kind: "docx" | "pptx";
  /** Human name of the source format, e.g. "Word". */
  label: string;
  icon: LucideIcon;
  mimeType: string;
}

export default function OfficeToPDFWorkflow({
  onBack,
  kind,
  label,
  icon,
  mimeType,
}: OfficeToPDFWorkflowProps) {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConversionResponse | null>(null);
  const [engine, setEngine] = useState<"libreoffice" | "basic" | null>(null);

  useEffect(() => {
    getOfficeEngine()
      .then(setEngine)
      .catch(() => setEngine(null));
  }, []);

  function choose(selected: File | null) {
    setFile(selected);
    setResult(null);
    setError("");
  }

  async function handleConvert() {
    if (!file) return;

    setResult(null);
    setError("");
    setProcessing(true);

    try {
      setResult(await officeToPDF(kind, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed.");
    } finally {
      setProcessing(false);
    }
  }

  const basic = result?.conversion_mode
    ? result.conversion_mode === "basic_text_only"
    : engine === "basic";

  return (
    <WorkflowShell
      icon={icon}
      title={`${label} to PDF`}
      description={`Convert a ${label} (.${kind}) document into a PDF. Your file is processed on this machine and not kept afterwards.`}
      onBack={onBack}
    >
      {basic && (
        <div className="mb-6">
          <Notice tone="warning">
            <strong>Basic conversion mode.</strong> LibreOffice is not installed
            on the server, so only text and simple tables are converted. Images,
            fonts, colours and layout are not preserved. Install LibreOffice for
            a faithful conversion.
          </Notice>
        </div>
      )}

      {!file ? (
        <FileDropzone
          title={`Drop your ${label} file here`}
          hint={`.${kind} only · Maximum 25 MB`}
          accept={`.${kind},${mimeType}`}
          extensions={[`.${kind}`]}
          maxBytes={MAX_BYTES}
          busy={false}
          busyLabel=""
          buttonLabel={`Select ${label} file`}
          onSelect={([selected]) => choose(selected)}
          onError={setError}
        />
      ) : (
        <section className="space-y-6">
          <FileChip
            name={file.name}
            detail={formatSize(file.size)}
            disabled={processing}
            onRemove={() => choose(null)}
          />

          <SubmitButton
            label="Convert to PDF"
            busyLabel="Converting... this can take a moment"
            icon={FileText}
            busy={processing}
            onClick={() => void handleConvert()}
          />
        </section>
      )}

      <ErrorBanner message={error} />

      {result && file && (
        <ResultCard
          title="Converted to PDF"
          detail={`${result.page_count ?? "?"} pages · ${formatSize(result.output_size_bytes)}`}
          href={getDownloadUrl(
            result.output_filename,
            `${file.name.replace(/\.[^.]+$/, "")}.pdf`,
          )}
          downloadLabel="Download PDF"
        />
      )}
    </WorkflowShell>
  );
}
