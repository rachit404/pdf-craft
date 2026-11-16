import type { Edge, Node } from "@xyflow/react";

import type { FlowDefinitionJSON, NodeState, OperationSpec } from "@/lib/api";

/** What a step on the canvas holds. */
export interface StepData extends Record<string, unknown> {
  /** "source", "output" or a registry operation id. */
  op: string;
  params: Record<string, unknown>;
  label?: string;
  /** Source steps: what kind of files they bring in. */
  kind?: string;
  /** Source steps: the stored files chosen in the editor (never saved with the flow). */
  files?: string[];
  state?: NodeState;
  /** Problems found by the last check. */
  issues?: string[];
}

export type StepNode = Node<StepData, "step">;
export type StepEdge = Edge;

export const SOURCE_KINDS = [
  { id: "pdf", label: "PDF files" },
  { id: "image", label: "Images" },
  { id: "docx", label: "Word files" },
  { id: "pptx", label: "PowerPoint files" },
];

export function newId(nodes: { id: string }[]): string {
  const used = new Set(nodes.map((node) => node.id));
  let index = nodes.length + 1;

  while (used.has(`n${index}`)) index += 1;

  return `n${index}`;
}

export function makeNode(op: string, position: { x: number; y: number }, nodes: { id: string }[], kind = "pdf"): StepNode {
  return {
    id: newId(nodes),
    type: "step",
    position,
    data: { op, params: op === "source" ? {} : {}, ...(op === "source" ? { kind, files: [] } : {}) },
  };
}

/** The kind of file a step hands on, for checking connections. */
export function outputKind(node: StepNode, specs: Map<string, OperationSpec>): string | null {
  if (node.data.op === "source") return node.data.kind ?? "pdf";
  if (node.data.op === "output") return null;

  return specs.get(node.data.op)?.output ?? null;
}

/** The flow for the server. `only` limits it to some steps (for "Run to here"). */
export function toDefinition(nodes: StepNode[], edges: StepEdge[], only?: Set<string>): FlowDefinitionJSON {
  const included = nodes.filter((node) => !only || only.has(node.id));
  const ids = new Set(included.map((node) => node.id));

  return {
    nodes: included.map((node) => ({
      id: node.id,
      op: node.data.op,
      params: node.data.op === "source" ? { kind: node.data.kind ?? "pdf" } : node.data.params,
      label: node.data.label ?? null,
      position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    })),
    edges: edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge) => ({ source: edge.source, target: edge.target, port: edge.targetHandle ?? null })),
  };
}

/** A step and everything feeding it. */
export function upstreamOf(id: string, edges: StepEdge[]): Set<string> {
  const found = new Set([id]);
  let grew = true;

  while (grew) {
    grew = false;

    for (const edge of edges) {
      if (found.has(edge.target) && !found.has(edge.source)) {
        found.add(edge.source);
        grew = true;
      }
    }
  }

  return found;
}

/** Steps and connections from a saved or imported definition. Masked passwords are cleared. */
export function fromDefinition(definition: FlowDefinitionJSON): { nodes: StepNode[]; edges: StepEdge[] } {
  const nodes: StepNode[] = definition.nodes.map((node, index) => {
    const params = Object.fromEntries(Object.entries(node.params ?? {}).filter(([, value]) => value !== "***"));
    const { kind, ...rest } = params as { kind?: string };

    return {
      id: node.id,
      type: "step",
      position: node.position ?? { x: 60 + index * 250, y: 120 },
      data: {
        op: node.op,
        params: node.op === "source" ? {} : rest,
        ...(node.op === "source" ? { kind: kind ?? "pdf", files: [] } : {}),
        ...(node.label ? { label: node.label } : {}),
      },
    };
  });

  const edges: StepEdge[] = definition.edges.map((edge, index) => ({
    id: `e${index}-${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    ...(edge.port ? { targetHandle: edge.port } : {}),
  }));

  return { nodes, edges };
}

/** Is this value a flow definition we can open? */
export function looksLikeDefinition(value: unknown): value is FlowDefinitionJSON {
  const flow = value as FlowDefinitionJSON;

  return (
    typeof flow === "object" &&
    flow !== null &&
    Array.isArray(flow.nodes) &&
    Array.isArray(flow.edges) &&
    flow.nodes.every((node) => typeof node?.id === "string" && typeof node?.op === "string")
  );
}

interface Template {
  id: string;
  name: string;
  description: string;
  definition: FlowDefinitionJSON;
}

function chain(steps: { op: string; params?: Record<string, unknown>; kind?: string }[]): FlowDefinitionJSON {
  return {
    nodes: steps.map((step, index) => ({
      id: `n${index + 1}`,
      op: step.op,
      params: step.op === "source" ? { kind: step.kind ?? "pdf" } : (step.params ?? {}),
      position: { x: 40 + index * 250, y: 140 },
    })),
    edges: steps.slice(1).map((_, index) => ({ source: `n${index + 1}`, target: `n${index + 2}` })),
  };
}

export const TEMPLATES: Template[] = [
  {
    id: "share",
    name: "Prepare for sharing",
    description: "Remove hidden data, shrink the file and add a watermark and page numbers.",
    definition: chain([
      { op: "source" },
      { op: "sanitize" },
      { op: "compress", params: { level: "balanced" } },
      { op: "watermark", params: { text: "CONFIDENTIAL" } },
      { op: "page_numbers" },
      { op: "output" },
    ]),
  },
  {
    id: "merge-protect",
    name: "Merge and lock",
    description: "Join several PDFs into one and protect it with a password.",
    definition: chain([{ op: "source" }, { op: "merge" }, { op: "protect", params: {} }, { op: "output" }]),
  },
  {
    id: "word-to-pdf",
    name: "Word to a small PDF",
    description: "Convert Word files to PDF, then make them smaller.",
    definition: chain([{ op: "source", kind: "docx" }, { op: "docx_to_pdf" }, { op: "compress", params: { level: "balanced" } }, { op: "output" }]),
  },
  {
    id: "photos",
    name: "Photos to one PDF",
    description: "Turn images into a single PDF with page numbers.",
    definition: chain([{ op: "source", kind: "image" }, { op: "images_to_pdf" }, { op: "page_numbers" }, { op: "output" }]),
  },
];
