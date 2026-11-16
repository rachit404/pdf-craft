"use client";

import { useState } from "react";
import { Unlock } from "lucide-react";

import { getDownloadUrl, unlockPDF, type UnlockResponse } from "@/lib/api";

import PasswordInput from "./shared/PasswordInput";
import PDFDropzone from "./shared/PDFDropzone";
import { usePDFWorkflow } from "./shared/usePDFWorkflow";
import {
  ErrorBanner,
  FileChip,
  formatSize,
  Notice,
  ResultCard,
  SubmitButton,
  WorkflowShell,
} from "./shared/ui";

export default function UnlockWorkflow({ onBack }: { onBack: () => void }) {
  // A locked PDF cannot be inspected, so skip the page-count lookup.
  const workflow = usePDFWorkflow<UnlockResponse>({ inspect: false });
  const { file, processing, result } = workflow;

  const [password, setPassword] = useState("");

  return (
    <WorkflowShell
      icon={Unlock}
      title="Unlock PDF"
      description="Remove password protection from a PDF you have the password for."
      onBack={onBack}
    >
      {!file ? (
        <PDFDropzone workflow={workflow} />
      ) : (
        <section className="space-y-6">
          <FileChip
            name={file.original_filename}
            detail={formatSize(file.size_bytes)}
            disabled={processing}
            onRemove={() => {
              workflow.reset();
              setPassword("");
            }}
          />

          <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
            <PasswordInput
              id="unlock-password"
              label="PDF password"
              value={password}
              disabled={processing}
              autoComplete="off"
              placeholder="Leave empty if there is no password to open it"
              onChange={(value) => {
                setPassword(value);
                workflow.clearResult();
              }}
            />
          </div>

          <Notice>
            You need the correct password; this tool does not crack or guess
            passwords. PDFs that only restrict printing or editing (and open
            without a password) can be unlocked with the field left empty.
          </Notice>

          <SubmitButton
            label="Unlock PDF"
            busyLabel="Unlocking..."
            icon={Unlock}
            busy={processing}
            onClick={() =>
              void workflow.run((filename) => unlockPDF(filename, password))
            }
          />
        </section>
      )}

      <ErrorBanner message={workflow.error} />

      {result && file && (
        <ResultCard
          title={
            result.was_encrypted
              ? "PDF unlocked"
              : "This PDF was not password protected"
          }
          detail={
            result.was_encrypted
              ? `Password and restrictions removed · ${formatSize(result.output_size_bytes)}`
              : `A clean copy is ready anyway · ${formatSize(result.output_size_bytes)}`
          }
          href={getDownloadUrl(
            result.output_filename,
            `${file.original_filename.replace(/\.pdf$/i, "")}-unlocked.pdf`,
          )}
          downloadLabel="Download unlocked PDF"
        />
      )}
    </WorkflowShell>
  );
}
