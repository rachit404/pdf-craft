"use client";

import { Eye, Loader2, Trash2, Upload } from "lucide-react";
import { useState } from "react";

import FilePreview from "@/components/studio/FilePreview";
import SchemaForm, { type Settings } from "@/components/studio/SchemaForm";
import Button from "@/components/ui/Button";
import { Segmented } from "@/components/ui/controls";
import Modal from "@/components/ui/Modal";
import type { NodeState, OperationSpec, StoredFileInfo } from "@/lib/api";
import { SOURCE_KINDS, type StepNode } from "@/lib/flows";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

interface NodeModalProps {
  node: StepNode;
  spec?: OperationSpec;
  state?: NodeState;
  issues: string[];
  /** Files arriving at this step in the last run. */
  inputNames: string[];
  library: StoredFileInfo[];
  running: boolean;
  uploading: boolean;
  onUpdate: (patch: Partial<StepNode["data"]>) => void;
  onAttach: (files: FileList | null) => void;
  onRemove: () => void;
  onClose: () => void;
  /** Run the flow up to this step so there is something to look at. */
  onPreviewRun: () => void;
}

const STATUS_TEXT: Record<string, string> = {
  pending: "Waiting",
  running: "Running",
  done: "Done",
  error: "Failed",
  skipped: "Skipped",
  cancelled: "Cancelled",
};

function titleOf(node: StepNode, spec?: OperationSpec): string {
  if (node.data.label) return node.data.label;
  if (node.data.op === "source") return "Files to start with";
  if (node.data.op === "output") return "Result";

  return spec?.label ?? node.data.op;
}

/** One step opened up: its settings on the left, what goes in and what comes out on the right. */
export default function NodeModal({ node, spec, state, issues, inputNames, library, running, uploading, onUpdate, onAttach, onRemove, onClose, onPreviewRun }: NodeModalProps) {
  const [side, setSide] = useState<"output" | "input">("output");
  const isSource = node.data.op === "source";
  const isResult = node.data.op === "output";
  const outputNames = state?.items ?? [];
  const sourceFiles = isSource ? library.filter((file) => file.kind === node.data.kind && file.available) : [];
  const chosen = node.data.files ?? [];
  const previewNames = isSource ? chosen : side === "input" ? inputNames : outputNames;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {titleOf(node, spec)}
          {state && (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[0.7rem] font-medium",
                state.status === "done" && "border-ok/40 text-ok",
                state.status === "error" && "border-danger/40 text-danger",
                state.status !== "done" && state.status !== "error" && "border-line-strong text-fg-muted",
              )}
            >
              {STATUS_TEXT[state.status]}
              {state.cached ? " · cached" : state.duration !== undefined ? ` · ${state.duration}s` : ""}
            </span>
          )}
        </span>
      }
      description={
        isSource
          ? "Choose the files this flow starts with. Choose several to run the whole flow on each of them."
          : isResult
            ? "Files reaching this step are what you keep."
            : spec?.description
      }
      footer={
        <>
          <Button variant="danger" onClick={onRemove}>
            <Trash2 className="size-4" strokeWidth={1.75} /> Remove step
          </Button>
          <span className="flex-1" />
          {!isSource && (
            <Button disabled={running} onClick={onPreviewRun}>
              {running ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" strokeWidth={1.75} />} Run to here and preview
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="grid gap-0 md:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        {/* Settings */}
        <section aria-label="Settings" className="space-y-4 border-b border-line p-5 md:border-b-0 md:border-r">
          {issues.length > 0 && (
            <ul className="space-y-0.5 rounded-ctl border border-danger/40 bg-danger/5 p-2.5 text-[0.8rem] text-danger">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          {state?.error && <p className="rounded-ctl border border-danger/40 bg-danger/5 p-2.5 text-[0.8rem] text-danger">{state.error}</p>}

          {isSource && (
            <>
              <label className="block">
                <span className="mb-1.5 block text-[0.8rem] font-medium text-fg-muted">Type of file</span>
                <select
                  value={node.data.kind}
                  onChange={(event) => onUpdate({ kind: event.target.value, files: [] })}
                  className="h-9 w-full rounded-ctl border border-line-strong bg-surface px-2 text-[0.85rem]"
                >
                  {SOURCE_KINDS.map((kind) => (
                    <option key={kind.id} value={kind.id}>
                      {kind.label}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <span className="mb-1.5 flex items-baseline justify-between text-[0.8rem] font-medium text-fg-muted">
                  From your files
                  <span className="font-mono text-[0.72rem] font-normal text-fg-subtle">{chosen.length} chosen</span>
                </span>
                {sourceFiles.length === 0 ? (
                  <p className="text-[0.8rem] text-fg-subtle">None of this type yet. Add some below.</p>
                ) : (
                  <ul className="max-h-72 space-y-0.5 overflow-y-auto rounded-ctl border border-line bg-surface p-1">
                    {sourceFiles.map((file) => {
                      const on = chosen.includes(file.name);

                      return (
                        <li key={file.name}>
                          <label className={cn("flex cursor-pointer items-center gap-2 rounded-ctl px-2 py-1.5 text-[0.82rem] hover:bg-hover", on && "bg-accent-soft")}>
                            <input
                              type="checkbox"
                              checked={on}
                              className="accent-[var(--accent)]"
                              onChange={(event) => onUpdate({ files: event.target.checked ? [...chosen, file.name] : chosen.filter((item) => item !== file.name) })}
                            />
                            <span className="min-w-0 flex-1 truncate">{file.original_name}</span>
                            <span className="text-[0.7rem] text-fg-subtle">{timeAgo(file.created_at)}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <label className="block">
                <Button className="w-full" disabled={uploading} onClick={(event) => (event.currentTarget.nextElementSibling as HTMLInputElement).click()}>
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" strokeWidth={1.75} />} Add from this computer
                </Button>
                <input type="file" multiple className="hidden" onChange={(event) => onAttach(event.target.files)} />
              </label>
            </>
          )}

          {spec && <SchemaForm key={node.id} operation={spec.id} value={node.data.params as Settings} onChange={(value) => onUpdate({ params: value })} pageCount={100000} />}

          {spec && Object.keys(spec.params_schema.properties ?? {}).length === 0 && <p className="text-[0.85rem] text-fg-subtle">This step has no settings.</p>}
          {isResult && <p className="text-[0.85rem] text-fg-subtle">Nothing to set here. Connect the step whose files you want to keep.</p>}
        </section>

        {/* Preview */}
        <section aria-label="Preview" className="min-w-0 bg-canvas/60 p-5">
          {!isSource && !isResult && (
            <div className="mb-3 max-w-xs">
              <Segmented
                label="What to preview"
                value={side}
                onChange={setSide}
                options={[
                  { id: "output", label: "What it makes" },
                  { id: "input", label: "What goes in" },
                ]}
              />
            </div>
          )}

          {previewNames.length > 0 ? (
            <FilePreview key={`${node.id}:${side}:${previewNames.join("|")}`} names={previewNames} />
          ) : (
            <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-12 text-center">
              <Eye className="size-7 text-fg-subtle" strokeWidth={1.5} />
              <p className="font-medium">{isSource ? "Nothing chosen yet" : "Nothing to look at yet"}</p>
              <p className="text-[0.82rem] text-fg-muted">
                {isSource ? "Tick a file on the left to see it here." : "Choose the files in the first step, then use Run to here and preview. It runs only the steps leading to this one."}
              </p>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
