"use client";

import { useState } from "react";

import {
  inspectPDF,
  uploadPDF,
  type PDFInfo,
  type PDFOperationResponse,
  type UploadedPDF,
} from "@/lib/api";

export const MAX_PDF_BYTES = 25 * 1024 * 1024;

interface OutputResult {
  output_filename: string;
  output_size_bytes: number;
}

/** Upload → configure → process → download state shared by single-PDF tools. */
export function usePDFWorkflow<
  R extends OutputResult = PDFOperationResponse,
>({ inspect = true }: { inspect?: boolean } = {}) {
  const [file, setFile] = useState<UploadedPDF | null>(null);
  const [info, setInfo] = useState<PDFInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<R | null>(null);

  /** Call when an option changes so a stale result is not shown. */
  function clearResult() {
    setResult(null);
    setError("");
  }

  function reset() {
    setFile(null);
    setInfo(null);
    clearResult();
  }

  async function upload(selected: File) {
    reset();
    setUploading(true);

    try {
      const uploaded = await uploadPDF(selected);
      // Password-protected PDFs cannot be inspected, so Unlock skips this.
      if (inspect) setInfo(await inspectPDF(uploaded.stored_filename));
      setFile(uploaded);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not upload or inspect PDF.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function run(task: (filename: string) => Promise<R>) {
    if (!file) return;

    clearResult();
    setProcessing(true);

    try {
      setResult(await task(file.stored_filename));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The operation failed.");
    } finally {
      setProcessing(false);
    }
  }

  return {
    file,
    info,
    uploading,
    processing,
    error,
    result,
    setError,
    clearResult,
    reset,
    upload,
    run,
  };
}
