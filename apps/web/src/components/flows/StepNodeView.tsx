"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Maximize2, X } from "lucide-react";
import { createContext, useContext } from "react";

import { pageThumbnailUrl, type OperationSpec } from "@/lib/api";
import { SOURCE_KINDS, type StepNode } from "@/lib/flows";
import { cn } from "@/lib/utils";

/** The operation catalogue, shared with every step on the canvas. */
export const SpecsContext = createContext<Map<string, OperationSpec>>(new Map());

/** What a step on the canvas can do to itself. */
export const NodeActionsContext = createContext<{ open: (id: string) => void; remove: (id: string) => void }>({ open: () => undefined, remove: () => undefined });

const STATUS_TEXT: Record<string, string> = {
  pending: "Waiting",
  running: "Running",
  done: "Done",
  error: "Failed",
  skipped: "Skipped",
  cancelled: "Cancelled",
};

function title(node: StepNode["data"], specs: Map<string, OperationSpec>): string {
  if (node.label) return node.label;
  if (node.op === "source") return SOURCE_KINDS.find((kind) => kind.id === node.kind)?.label ?? "Files";
  if (node.op === "output") return "Result";

  return specs.get(node.op)?.label ?? node.op;
}

/** One step on the canvas: its name, its inputs on the left, its result on the right. */
export default function StepNodeView({ id, data, selected }: NodeProps<StepNode>) {
  const specs = useContext(SpecsContext);
  const actions = useContext(NodeActionsContext);
  const spec = specs.get(data.op);
  const inputs = spec?.inputs ?? [];
  const status = data.state?.status;
  const first = data.state?.items?.[0];
  const count = data.state?.items?.length ?? 0;
  const problem = (data.issues?.length ?? 0) > 0 || status === "error";

  return (
    <div
      className={cn(
        "group pc-pop relative w-52 cursor-pointer rounded-box border bg-surface text-fg shadow-sm transition-[box-shadow,border-color] duration-200 hover:shadow-md",
        selected ? "border-accent ring-2 ring-accent/30" : problem ? "border-danger" : "border-line-strong",
      )}
    >
      {data.op !== "source" &&
        (inputs.length === 0 ? (
          <Handle type="target" position={Position.Left} className="!size-2.5 !border-line-strong !bg-surface" />
        ) : (
          inputs.map((port, index) => (
            <Handle
              key={port.name}
              id={port.name}
              type="target"
              position={Position.Left}
              style={{ top: `${((index + 1) / (inputs.length + 1)) * 100}%` }}
              title={`${port.label} (${port.kind})`}
              className="!size-2.5 !border-line-strong !bg-surface"
            />
          ))
        ))}

      <div className="absolute -top-3 right-2 hidden gap-1 group-focus-within:flex group-hover:flex">
        <button type="button" aria-label="Open this step" title="Open" onClick={(event) => { event.stopPropagation(); actions.open(id); }} className="nodrag flex size-6 items-center justify-center rounded-full border border-line-strong bg-surface text-fg-muted shadow-sm hover:text-accent">
          <Maximize2 className="size-3" strokeWidth={2} />
        </button>
        <button type="button" aria-label="Remove this step" title="Remove" onClick={(event) => { event.stopPropagation(); actions.remove(id); }} className="nodrag flex size-6 items-center justify-center rounded-full border border-line-strong bg-surface text-fg-muted shadow-sm hover:text-danger">
          <X className="size-3" strokeWidth={2} />
        </button>
      </div>

      <div className="flex items-start gap-2 px-3 pb-2 pt-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.85rem] font-semibold">{title(data, specs)}</p>
          <p className="truncate text-[0.72rem] text-fg-subtle">
            {data.op === "source"
              ? data.files?.length
                ? `${data.files.length} file${data.files.length === 1 ? "" : "s"} chosen`
                : "Choose files"
              : data.op === "output"
                ? "What you keep"
                : (spec?.category ?? "")}
          </p>
        </div>
        {status && (
          <span
            title={STATUS_TEXT[status]}
            className={cn(
              "mt-1 size-2.5 shrink-0 rounded-full",
              status === "done" && "bg-ok",
              status === "running" && "animate-pulse bg-accent",
              status === "error" && "bg-danger",
              (status === "pending" || status === "skipped" || status === "cancelled") && "bg-fg-subtle",
            )}
          />
        )}
      </div>

      {status === "done" && count > 0 && (
        <div className="flex items-center gap-2 border-t border-line px-3 py-1.5">
          {first?.endsWith(".pdf") && (
            // eslint-disable-next-line @next/next/no-img-element -- server-rendered thumbnail
            <img src={pageThumbnailUrl(first, 1, 120)} alt="" className="pc-img h-10 w-8 rounded-[2px] bg-page object-contain shadow-[0_0_0_1px_var(--line-strong)]" onLoad={(event) => event.currentTarget.setAttribute("data-ready", "")} onError={(event) => event.currentTarget.setAttribute("data-ready", "")} />
          )}
          <span className="font-mono text-[0.72rem] text-fg-muted">
            {count} file{count === 1 ? "" : "s"}
            {data.state?.cached ? " · cached" : data.state?.duration !== undefined && ` · ${data.state.duration}s`}
          </span>
        </div>
      )}
      {status === "error" && <p className="border-t border-line px-3 py-1.5 text-[0.72rem] text-danger">{data.state?.error ?? "Failed"}</p>}
      {!status && (data.issues?.length ?? 0) > 0 && <p className="border-t border-line px-3 py-1.5 text-[0.72rem] text-danger">{data.issues![0]}</p>}

      {data.op !== "output" && (
        <Handle type="source" position={Position.Right} className="!size-2.5 !border-accent !bg-accent" />
      )}
    </div>
  );
}
