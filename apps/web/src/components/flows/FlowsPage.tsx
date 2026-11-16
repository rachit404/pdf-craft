"use client";

import {
  addEdge,
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Download, FolderOpen, LayoutTemplate, Loader2, Play, Save, Square, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";

import SchemaForm, { type Settings } from "@/components/studio/SchemaForm";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/controls";
import {
  cancelRun,
  deleteSavedFlow,
  getFileDownloadUrl,
  getRegistry,
  getRun,
  listFiles,
  listSavedFlows,
  saveFlow,
  startRun,
  uploadFile,
  validateFlow,
  type FlowRunDetail,
  type OperationSpec,
  type SavedFlow,
  type StoredFileInfo,
} from "@/lib/api";
import {
  fromDefinition,
  looksLikeDefinition,
  makeNode,
  outputKind,
  SOURCE_KINDS,
  TEMPLATES,
  toDefinition,
  upstreamOf,
  type StepEdge,
  type StepNode,
} from "@/lib/flows";
import { timeAgo } from "@/lib/format";
import type { Route } from "@/lib/route";
import { cn } from "@/lib/utils";

import StepNodeView, { SpecsContext } from "./StepNodeView";

const nodeTypes = { step: StepNodeView };
const FINISHED = ["done", "failed", "cancelled"];

function Menu({ label, icon, children }: { label: string; icon: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {icon} {label}
      </Button>
      {open && (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-9 z-30 w-72 rounded-box border border-line-strong bg-surface p-1 shadow-lg">{children(() => setOpen(false))}</div>
        </>
      )}
    </div>
  );
}

function Editor({ navigate, openId }: { navigate: (route: Route) => void; openId?: string }) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<StepEdge>([]);
  const [specs, setSpecs] = useState<Map<string, OperationSpec>>(new Map());
  const [name, setName] = useState("Untitled flow");
  const [savedId, setSavedId] = useState<string | undefined>();
  const [saved, setSaved] = useState<SavedFlow[]>([]);
  const [library, setLibrary] = useState<StoredFileInfo[]>([]);
  const [states, setStates] = useState<FlowRunDetail["node_states"]>({});
  const [issues, setIssues] = useState<{ node: string | null; message: string }[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [result, setResult] = useState<FlowRunDetail | null>(null);
  const [uploading, setUploading] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    getRegistry()
      .then((all) => alive.current && setSpecs(new Map(all.map((spec) => [spec.id, spec]))))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not load the tools."));
    listSavedFlows()
      .then((list) => {
        if (!alive.current) return;

        setSaved(list);

        const wanted = openId ? list.find((flow) => flow.id === openId) : undefined;

        if (wanted) load(fromDefinition(wanted.definition), wanted.name, wanted.id);
      })
      .catch(() => undefined);
    listFiles().then((list) => alive.current && setLibrary(list)).catch(() => undefined);

    return () => {
      alive.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const running = runId !== null;
  const selected = nodes.find((node) => node.selected);

  // What the canvas shows: each step with its latest run state and problems.
  const shown = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          state: states[node.id],
          issues: issues.filter((issue) => issue.node === node.id).map((issue) => issue.message),
        },
      })),
    [nodes, states, issues],
  );

  const changed = useCallback(() => {
    setIssues([]);
  }, []);

  function updateData(id: string, patch: Partial<StepNode["data"]>) {
    setNodes((existing) => existing.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...patch } } : node)));
    changed();
  }

  function add(op: string, kind?: string, at?: { x: number; y: number }) {
    const right = nodes.reduce((max, node) => Math.max(max, node.position.x), -200);
    const node = makeNode(op, at ?? { x: right + 250, y: 140 }, nodes, kind);

    setNodes((existing) => [...existing.map((item) => ({ ...item, selected: false })), { ...node, selected: true }]);
    changed();
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();

    const [op, kind] = event.dataTransfer.getData("application/pdfcraft-step").split(":");

    if (op) add(op, kind || undefined, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }

  function isValidConnection(connection: Connection | StepEdge): boolean {
    if (!connection.source || !connection.target || connection.source === connection.target) return false;

    const from = nodes.find((node) => node.id === connection.source);
    const to = nodes.find((node) => node.id === connection.target);

    if (!from || !to || to.data.op === "source" || from.data.op === "output") return false;
    if (to.data.op === "output") return true;

    const port = specs.get(to.data.op)?.inputs.find((input) => input.name === connection.targetHandle);

    return Boolean(port) && outputKind(from, specs) === port?.kind;
  }

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((existing) => addEdge({ ...connection, id: `e-${connection.source}-${connection.target}-${connection.targetHandle ?? "in"}` }, existing));
      changed();
    },
    [setEdges, changed],
  );

  function load(next: { nodes: StepNode[]; edges: StepEdge[] }, title: string, id?: string) {
    setNodes(next.nodes);
    setEdges(next.edges);
    setName(title);
    setSavedId(id);
    setStates({});
    setIssues([]);
    setResult(null);
    window.setTimeout(() => void fitView({ padding: 0.2 }), 50);
  }

  async function save() {
    try {
      const stored = await saveFlow(name.trim() || "Untitled flow", toDefinition(nodes, edges), savedId);

      setSavedId(stored.id);
      setSaved(await listSavedFlows());
      toast.success("Flow saved. Passwords are not stored.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    }
  }

  function exportFlow() {
    const definition = toDefinition(nodes, edges);
    // Passwords are never written to an exported file.
    const safe = definition.nodes.map((node) => ({
      ...node,
      params: Object.fromEntries(Object.entries(node.params).filter(([key]) => !/password/i.test(key))),
    }));
    const blob = new Blob([JSON.stringify({ name, ...definition, nodes: safe }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");

    link.href = URL.createObjectURL(blob);
    link.download = `${name.replace(/[^\w-]+/g, "-") || "flow"}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function importFlow(file?: File) {
    if (!file) return;

    try {
      const parsed: unknown = JSON.parse(await file.text());

      if (!looksLikeDefinition(parsed)) throw new Error("not a flow");

      load(fromDefinition(parsed), (parsed as { name?: string }).name ?? file.name.replace(/\.json$/i, ""));
    } catch {
      toast.error("That file is not a flow exported from PDF Craft.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  /** Check, then run the whole flow or only the steps leading to one. */
  async function run(onlyUpTo?: string) {
    const only = onlyUpTo ? upstreamOf(onlyUpTo, edges) : undefined;
    const definition = toDefinition(nodes, edges, only);
    const inputs: Record<string, string[]> = {};
    const problems: { node: string | null; message: string }[] = [];

    for (const node of nodes) {
      if (node.data.op === "source" && (!only || only.has(node.id))) {
        inputs[node.id] = node.data.files ?? [];

        if (inputs[node.id].length === 0) problems.push({ node: node.id, message: "Choose at least one file." });
      }
    }

    setResult(null);
    setStates({});

    try {
      problems.push(...(await validateFlow(definition)));

      if (problems.length > 0) {
        setIssues(problems);

        return;
      }

      setIssues([]);

      const id = await startRun(definition, inputs);

      setRunId(id);

      for (let attempt = 0; attempt < 1200 && alive.current; attempt++) {
        const detail = await getRun(id);

        setStates(detail.node_states);

        if (FINISHED.includes(detail.status)) {
          setResult(detail);
          setLibrary(await listFiles());

          if (detail.status === "failed") toast.error(detail.error ?? "The run failed.");
          else if (detail.status === "done") toast.success(`Done: ${detail.files.length} file${detail.files.length === 1 ? "" : "s"}`);

          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run the flow.");
    } finally {
      setRunId(null);
    }
  }

  async function attach(node: StepNode, files: FileList | null) {
    if (!files?.length) return;

    setUploading(true);

    try {
      const stored: StoredFileInfo[] = [];

      for (const file of Array.from(files)) stored.push(await uploadFile(file));

      setLibrary(await listFiles());
      updateData(node.id, { files: [...new Set([...(node.data.files ?? []), ...stored.filter((item) => item.kind === node.data.kind).map((item) => item.name)])] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the files.");
    } finally {
      setUploading(false);
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, OperationSpec[]>();

    for (const spec of specs.values()) map.set(spec.category, [...(map.get(spec.category) ?? []), spec]);

    return [...map.entries()];
  }, [specs]);

  const paletteItem = (key: string, label: string, op: string, kind?: string) => (
    <button
      key={key}
      type="button"
      draggable
      onDragStart={(event) => event.dataTransfer.setData("application/pdfcraft-step", `${op}:${kind ?? ""}`)}
      onClick={() => add(op, kind)}
      className="block w-full rounded-ctl px-2 py-1 text-left text-[0.82rem] text-fg-muted hover:bg-hover hover:text-fg"
    >
      {label}
    </button>
  );

  const spec = selected ? specs.get(selected.data.op) : undefined;
  const sourceFiles = selected?.data.op === "source" ? library.filter((file) => file.kind === selected.data.kind && file.available) : [];

  return (
    <SpecsContext.Provider value={specs}>
      <div className="flex h-full min-h-0 flex-col">
        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Flow name" maxLength={80} className="w-44 font-medium" />
          <Menu label="Open" icon={<FolderOpen className="size-4" strokeWidth={1.75} />}>
            {(close) =>
              saved.length === 0 ? (
                <p className="px-2 py-2 text-[0.8rem] text-fg-subtle">No saved flows yet.</p>
              ) : (
                saved.map((flow) => (
                  <div key={flow.id} className="flex items-center gap-1 rounded-ctl hover:bg-hover">
                    <button
                      type="button"
                      className="min-w-0 flex-1 px-2 py-1.5 text-left"
                      onClick={() => {
                        load(fromDefinition(flow.definition), flow.name, flow.id);
                        close();
                      }}
                    >
                      <span className="block truncate text-[0.85rem] font-medium">{flow.name}</span>
                      <span className="block text-[0.72rem] text-fg-subtle">{flow.definition.nodes.length} steps · {timeAgo(flow.updated_at)}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${flow.name}`}
                      className="p-1.5 text-fg-subtle hover:text-danger"
                      onClick={async () => {
                        await deleteSavedFlow(flow.id).catch(() => undefined);
                        if (savedId === flow.id) setSavedId(undefined);
                        setSaved(await listSavedFlows());
                      }}
                    >
                      <Trash2 className="size-4" strokeWidth={1.75} />
                    </button>
                  </div>
                ))
              )
            }
          </Menu>
          <Menu label="Templates" icon={<LayoutTemplate className="size-4" strokeWidth={1.75} />}>
            {(close) =>
              TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="block w-full rounded-ctl px-2 py-1.5 text-left hover:bg-hover"
                  onClick={() => {
                    load(fromDefinition(template.definition), template.name);
                    close();
                  }}
                >
                  <span className="block text-[0.85rem] font-medium">{template.name}</span>
                  <span className="block text-[0.75rem] text-fg-subtle">{template.description}</span>
                </button>
              ))
            }
          </Menu>
          <Button size="sm" onClick={() => void save()} disabled={nodes.length === 0}>
            <Save className="size-4" strokeWidth={1.75} /> Save
          </Button>
          <Button size="sm" variant="ghost" onClick={exportFlow} disabled={nodes.length === 0}>
            <Download className="size-4" strokeWidth={1.75} /> Export
          </Button>
          <Button size="sm" variant="ghost" onClick={() => importRef.current?.click()}>
            <Upload className="size-4" strokeWidth={1.75} /> Import
          </Button>
          <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void importFlow(event.target.files?.[0])} />
          <span className="flex-1" />
          {running ? (
            <Button size="sm" variant="danger" onClick={() => runId && void cancelRun(runId)}>
              <Square className="size-4" strokeWidth={1.75} /> Stop
            </Button>
          ) : (
            <>
              <Button size="sm" disabled={!selected || selected.data.op === "source"} onClick={() => selected && void run(selected.id)}>
                Run to here
              </Button>
              <Button size="sm" variant="primary" disabled={nodes.length === 0} onClick={() => void run()}>
                <Play className="size-4" strokeWidth={1.75} /> Run flow
              </Button>
            </>
          )}
          {running && <Loader2 className="size-4 animate-spin text-accent" />}
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Palette */}
          <aside className="w-48 shrink-0 overflow-y-auto border-r border-line bg-panel p-2" aria-label="Steps">
            <p className="px-2 pb-1 text-[0.7rem] font-semibold uppercase tracking-wide text-fg-subtle">Start</p>
            {SOURCE_KINDS.map((kind) => paletteItem(`source-${kind.id}`, kind.label, "source", kind.id))}
            {groups.map(([category, items]) => (
              <div key={category} className="mt-2">
                <p className="px-2 pb-1 text-[0.7rem] font-semibold uppercase tracking-wide text-fg-subtle">{category}</p>
                {items.map((item) => paletteItem(item.id, item.label, item.id))}
              </div>
            ))}
            <p className="mt-2 px-2 pb-1 text-[0.7rem] font-semibold uppercase tracking-wide text-fg-subtle">Finish</p>
            {paletteItem("output", "Result", "output")}
          </aside>

          {/* Canvas */}
          <div className="relative min-w-0 flex-1 bg-canvas" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
            <ReactFlow
              nodes={shown}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={(changes) => {
                onEdgesChange(changes);
                changed();
              }}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              fitView
              deleteKeyCode={["Backspace", "Delete"]}
              defaultEdgeOptions={{ style: { stroke: "var(--fg-subtle)", strokeWidth: 1.5 } }}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="var(--line-strong)" gap={20} />
              <Controls showInteractive={false} />
            </ReactFlow>
            {nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="max-w-xs text-center">
                  <p className="font-medium">Build a flow</p>
                  <p className="mt-1 text-[0.85rem] text-fg-subtle">
                    Click or drag steps from the left, join them by dragging from one dot to the next, or open a template. Each step passes its result on, so nothing is downloaded in between.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Inspector */}
          <aside className="w-72 shrink-0 overflow-y-auto border-l border-line bg-panel p-4 lg:w-80" aria-label="Step options">
            {!selected ? (
              <p className="text-[0.85rem] text-fg-subtle">Select a step to change its settings. Press Delete to remove the selected step or connection.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="text-[0.95rem] font-semibold">
                    {selected.data.op === "source" ? "Files to start with" : selected.data.op === "output" ? "Result" : spec?.label}
                  </h2>
                  <p className="mt-0.5 text-[0.8rem] text-fg-muted">
                    {selected.data.op === "source"
                      ? "Choose the files this flow starts with."
                      : selected.data.op === "output"
                        ? "Files reaching this step are what you keep."
                        : spec?.description}
                  </p>
                </div>

                {selected.data.op === "source" && (
                  <>
                    <label className="block">
                      <span className="mb-1.5 block text-[0.8rem] font-medium text-fg-muted">Type of file</span>
                      <select
                        value={selected.data.kind}
                        onChange={(event) => updateData(selected.id, { kind: event.target.value, files: [] })}
                        className="h-8 w-full rounded-ctl border border-line-strong bg-surface px-2 text-[0.85rem]"
                      >
                        {SOURCE_KINDS.map((kind) => (
                          <option key={kind.id} value={kind.id}>{kind.label}</option>
                        ))}
                      </select>
                    </label>
                    <div>
                      <span className="mb-1.5 block text-[0.8rem] font-medium text-fg-muted">From your files</span>
                      {sourceFiles.length === 0 ? (
                        <p className="text-[0.8rem] text-fg-subtle">None of this type yet.</p>
                      ) : (
                        <ul className="max-h-56 space-y-0.5 overflow-y-auto rounded-ctl border border-line bg-surface p-1">
                          {sourceFiles.map((file) => {
                            const on = selected.data.files?.includes(file.name) ?? false;

                            return (
                              <li key={file.name}>
                                <label className={cn("flex cursor-pointer items-center gap-2 rounded-ctl px-2 py-1 text-[0.82rem] hover:bg-hover", on && "bg-accent-soft/50")}>
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    className="accent-[var(--accent)]"
                                    onChange={(event) =>
                                      updateData(selected.id, {
                                        files: event.target.checked ? [...(selected.data.files ?? []), file.name] : (selected.data.files ?? []).filter((item) => item !== file.name),
                                      })
                                    }
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
                      <input type="file" multiple className="hidden" onChange={(event) => void attach(selected, event.target.files)} />
                    </label>
                  </>
                )}

                {spec && (
                  <SchemaForm
                    key={selected.id}
                    operation={spec.id}
                    value={selected.data.params as Settings}
                    onChange={(value) => updateData(selected.id, { params: value })}
                    pageCount={100000}
                  />
                )}

                {states[selected.id]?.error && <p className="text-[0.8rem] text-danger">{states[selected.id].error}</p>}

                <Button
                  variant="danger"
                  className="w-full"
                  onClick={() => {
                    setNodes((existing) => existing.filter((node) => node.id !== selected.id));
                    setEdges((existing) => existing.filter((edge) => edge.source !== selected.id && edge.target !== selected.id));
                    changed();
                  }}
                >
                  <Trash2 className="size-4" strokeWidth={1.75} /> Remove this step
                </Button>
              </div>
            )}
          </aside>
        </div>

        {/* Problems and results */}
        {(issues.length > 0 || result) && (
          <div className="max-h-44 shrink-0 overflow-y-auto border-t border-line bg-panel px-4 py-2.5">
            {issues.length > 0 && (
              <ul className="space-y-0.5 text-[0.82rem] text-danger">
                {issues.map((issue, index) => (
                  <li key={index}>{issue.message}</li>
                ))}
              </ul>
            )}
            {result && (
              <div>
                <p className="mb-1.5 text-[0.82rem] font-semibold">
                  {result.status === "done" ? `Result: ${result.files.length} file${result.files.length === 1 ? "" : "s"}` : result.status === "cancelled" ? "Stopped" : `Failed: ${result.error ?? ""}`}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {result.files.map((file) => (
                    <li key={file.name} className="flex items-center gap-2 rounded-ctl border border-line bg-surface px-2.5 py-1 text-[0.8rem]">
                      <span className="max-w-48 truncate">{file.original_name}</span>
                      {file.kind === "pdf" && (
                        <button type="button" className="font-medium text-accent hover:underline" onClick={() => navigate({ name: "studio", file: file.name })}>
                          Open
                        </button>
                      )}
                      <a href={getFileDownloadUrl(file.name)} download className="font-medium text-accent hover:underline">
                        Download
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </SpecsContext.Provider>
  );
}

/** Build a chain of steps on a canvas: each step hands its result to the next. */
export default function FlowsPage({ navigate, openId }: { navigate: (route: Route) => void; openId?: string }) {
  return (
    <ReactFlowProvider>
      <Editor navigate={navigate} openId={openId} />
    </ReactFlowProvider>
  );
}
