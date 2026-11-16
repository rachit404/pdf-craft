"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  applyOperation,
  getFileInfo,
  type OperationResult,
  getVersions,
  inspectPDF,
  type PDFInfo,
  type StoredFileInfo,
} from "@/lib/api";
import { operationName } from "@/lib/operations";

export interface Version {
  name: string;
  label: string;
  /** Registry id and settings of the edit that made this version (only for edits made in this session). */
  operation?: string;
  settings?: Record<string, unknown>;
}

export interface StudioState {
  /** The version being worked on. */
  current: string;
  versions: Version[];
  index: number;
  /** Document details; null while loading or when the PDF is locked. */
  info: PDFInfo | null;
  record: StoredFileInfo | null;
  /** Set when the document could not be read (for example it is locked). */
  readError: string;
  busy: boolean;
  error: string;
  loading: boolean;
}

/** Everything about the document open in the Studio: its versions, undo and the operations on it. */
export function useStudio(openedName: string) {
  const [versions, setVersions] = useState<Version[]>([{ name: openedName, label: "Original" }]);
  const [index, setIndex] = useState(0);
  const [info, setInfo] = useState<PDFInfo | null>(null);
  const [record, setRecord] = useState<StoredFileInfo | null>(null);
  const [readError, setReadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const current = versions[index]?.name ?? openedName;
  const loadedFor = useRef("");

  // History of the opened file: the versions that led to it.
  useEffect(() => {
    let cancelled = false;

    getVersions(openedName)
      .then((chain) => {
        if (cancelled) return;

        const list = chain.map((file, position) => ({
          name: file.name,
          label: position === 0 ? "Original" : operationName(file.operation),
        }));

        setVersions(list.length ? list : [{ name: openedName, label: "Original" }]);
        setIndex(Math.max(0, list.length - 1));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [openedName]);

  // Details of whichever version is current.
  useEffect(() => {
    let cancelled = false;
    loadedFor.current = current;

    Promise.all([inspectPDF(current).then((i) => ({ info: i, problem: "" }), (e: unknown) => ({ info: null, problem: e instanceof Error ? e.message : "Could not read this PDF." })), getFileInfo(current).catch(() => null)]).then(
      ([result, file]) => {
        if (cancelled || loadedFor.current !== current) return;

        setInfo(result.info);
        setReadError(result.problem);
        setRecord(file);
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [current]);

  /** Run an operation on the current version; its result becomes the new current version. */
  const apply = useCallback(
    async (operation: string, settings: Record<string, unknown>, label?: string): Promise<OperationResult | null> => {
      setBusy(true);
      setError("");

      try {
        const result = await applyOperation(operation, current, settings);

        setVersions((existing) => [
          ...existing.slice(0, index + 1),
          { name: result.output_filename, label: label ?? operationName(operation), operation, settings },
        ]);
        setIndex(index + 1);

        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "That did not work.");

        return null;
      } finally {
        setBusy(false);
      }
    },
    [current, index],
  );

  /** Add a result that was made elsewhere (for example by a merge) as the newest version. */
  const goto = useCallback((position: number) => {
    setError("");
    setLoading(true);
    setIndex(Math.min(Math.max(position, 0), versions.length - 1));
  }, [versions.length]);

  return {
    current,
    versions,
    index,
    info,
    record,
    readError,
    busy,
    error,
    loading,
    setError,
    apply,
    goto,
    undo: () => goto(index - 1),
    redo: () => goto(index + 1),
    canUndo: index > 0,
    canRedo: index < versions.length - 1,
  };
}

export type Studio = ReturnType<typeof useStudio>;
