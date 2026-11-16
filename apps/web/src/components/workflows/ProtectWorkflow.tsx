"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

import { getDownloadUrl, protectPDF, type SecurityResult } from "@/lib/api";

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
  ToggleRow,
  WorkflowShell,
} from "./shared/ui";

export default function ProtectWorkflow({ onBack }: { onBack: () => void }) {
  const workflow = usePDFWorkflow<SecurityResult>();
  const { file, info, processing, result } = workflow;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [owner, setOwner] = useState("");
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(false);
  const [allowModifying, setAllowModifying] = useState(false);
  const [allowAnnotations, setAllowAnnotations] = useState(false);

  const mismatch = confirm !== "" && password !== confirm;
  const ready = password !== "" && password === confirm;

  function change<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      workflow.clearResult();
    };
  }

  function handleSubmit() {
    if (!ready) {
      workflow.setError("Enter the same password twice.");
      return;
    }

    void workflow.run((filename) =>
      protectPDF(filename, {
        userPassword: password,
        ownerPassword: owner,
        allowPrinting,
        allowCopying,
        allowModifying,
        allowAnnotations,
      }),
    );
  }

  return (
    <WorkflowShell
      icon={Lock}
      title="Protect PDF"
      description="Encrypt your PDF with a password (AES-256). Anyone opening it must enter the password."
      onBack={onBack}
    >
      {!file || !info ? (
        <PDFDropzone workflow={workflow} />
      ) : (
        <section className="space-y-6">
          <FileChip
            name={file.original_filename}
            detail={`${formatSize(file.size_bytes)} · ${info.page_count} pages`}
            disabled={processing}
            onRemove={() => {
              workflow.reset();
              setPassword("");
              setConfirm("");
              setOwner("");
            }}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
              <h2 className="font-semibold text-gray-900">Password</h2>

              <PasswordInput
                id="password"
                label="Password to open the PDF"
                value={password}
                disabled={processing}
                onChange={change(setPassword)}
              />

              <div>
                <PasswordInput
                  id="confirm"
                  label="Repeat password"
                  value={confirm}
                  disabled={processing}
                  onChange={change(setConfirm)}
                />
                {mismatch && (
                  <p className="mt-2 text-xs text-red-600">
                    The passwords do not match.
                  </p>
                )}
              </div>

              <PasswordInput
                id="owner"
                label="Owner password (optional)"
                value={owner}
                disabled={processing}
                placeholder="Lets you change permissions later"
                onChange={change(setOwner)}
              />
            </div>

            <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
              <h2 className="font-semibold text-gray-900">
                What people can do
              </h2>

              <ToggleRow
                label="Print"
                checked={allowPrinting}
                disabled={processing}
                onChange={change(setAllowPrinting)}
              />
              <ToggleRow
                label="Copy text and images"
                checked={allowCopying}
                disabled={processing}
                onChange={change(setAllowCopying)}
              />
              <ToggleRow
                label="Edit the document"
                checked={allowModifying}
                disabled={processing}
                onChange={change(setAllowModifying)}
              />
              <ToggleRow
                label="Add comments and fill forms"
                checked={allowAnnotations}
                disabled={processing}
                onChange={change(setAllowAnnotations)}
              />
            </div>
          </div>

          <Notice tone="warning">
            <strong>There is no password recovery.</strong> If you forget the
            password, the file cannot be opened. Permissions are respected by
            standard PDF viewers but are not a hard guarantee; the password is
            what protects the content.
          </Notice>

          <SubmitButton
            label="Protect PDF"
            busyLabel="Encrypting..."
            icon={Lock}
            busy={processing}
            disabled={!ready}
            onClick={handleSubmit}
          />
        </section>
      )}

      <ErrorBanner message={workflow.error} />

      {result && file && (
        <ResultCard
          title="PDF protected"
          detail={`Encrypted with AES-256 · ${formatSize(result.output_size_bytes)}`}
          href={getDownloadUrl(
            result.output_filename,
            `${file.original_filename.replace(/\.pdf$/i, "")}-protected.pdf`,
          )}
          downloadLabel="Download protected PDF"
        />
      )}
    </WorkflowShell>
  );
}
