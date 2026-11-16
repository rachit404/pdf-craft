"use client";

import {
  Copy,
  Download,
  FileText,
  Loader2,
  RotateCcw,
  RotateCw,
  Scissors,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import Button from "@/components/ui/Button";
import { Input, Segmented } from "@/components/ui/controls";
import { Notice } from "@/components/ui/blocks";
import {
  applyOperation,
  extractText,
  getFileDownloadUrl,
  getFormFields,
  getRegistry,
  runFlow,
  uploadFile,
  type ExtractedText,
  type FormField,
  type RedactionRegion,
} from "@/lib/api";
import { formatSize } from "@/lib/format";
import { formatPages } from "@/lib/pages";

import SchemaForm, { defaultsFor, type FieldHint, type Settings } from "./SchemaForm";
import type { Studio } from "./useStudio";

/** What the centre of the Studio shows for the active panel. */
export interface Stage {
  /** Where the user clicked, in PDF points from the bottom-left. */
  pick: { x: number; y: number } | null;
  /** Text being placed. */
  text: { value: string; size: number; color: string } | null;
  /** Image being placed (preview URL, height/width ratio, width as % of the page). */
  image: { url: string; ratio: number; widthPercent: number } | null;
  /** Areas marked for redaction. */
  regions: (RedactionRegion & { id: number })[];
}

export const EMPTY_STAGE: Stage = { pick: null, text: null, image: null, regions: [] };

export interface PanelProps {
  studio: Studio;
  pageCount: number;
  pageNo: number;
  selection: number[];
  mode: string;
  onMode: (mode: string) => void;
  stage: Stage;
  patchStage: (patch: Partial<Stage>) => void;
  pageSize: { width: number; height: number } | null;
  /** Called after an operation that changes the page order or count. */
  onChanged: () => void;
  order: number[];
  /** Open another file in the Studio. */
  onOpenFile: (name: string) => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-[0.8rem] font-medium text-fg-muted">{label}</span>
      {children}
    </div>
  );
}

function ApplyButton({
  busy,
  disabled,
  onClick,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button variant="primary" size="lg" className="w-full" disabled={busy || disabled} onClick={onClick}>
      {busy && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}

/** A registry operation: its settings form plus an Apply button. */
function OperationForm({
  studio,
  operation,
  label,
  pageCount,
  hints,
  prepare,
  success,
}: {
  studio: Studio;
  operation: string;
  label: string;
  pageCount: number;
  hints?: Record<string, FieldHint>;
  /** Adjust the settings before they are sent. */
  prepare?: (settings: Settings) => Settings;
  success?: string;
}) {
  const [settings, setSettings] = useState<Settings>({});

  useEffect(() => {
    let cancelled = false;

    getRegistry()
      .then((all) => {
        if (!cancelled) setSettings(defaultsFor(all.find((item) => item.id === operation)));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [operation]);

  return (
    <div className="space-y-4">
      <SchemaForm
        operation={operation}
        value={settings}
        onChange={setSettings}
        pageCount={pageCount}
        hints={hints}
        disabled={studio.busy}
      />
      <ApplyButton
        busy={studio.busy}
        onClick={async () => {
          const result = await studio.apply(operation, prepare ? prepare(settings) : settings);

          if (result) toast.success(success ?? `${label} done`);
        }}
      >
        {label}
      </ApplyButton>
    </div>
  );
}

// ---------------------------------------------------------
// Pages
// ---------------------------------------------------------

export function PagesPanel({ studio, selection, pageCount, order, onChanged, onOpenFile }: PanelProps) {
  const [every, setEvery] = useState("1");
  const [splitBusy, setSplitBusy] = useState(false);
  const reordered = order.some((page, index) => page !== index + 1);
  const none = selection.length === 0;
  const all = selection.length === pageCount;

  async function run(operation: string, settings: Settings, message: string) {
    if (await studio.apply(operation, settings)) {
      toast.success(message);
      onChanged();
    }
  }

  async function splitWith(operation: string, params: Settings) {
    setSplitBusy(true);

    try {
      const run = await runFlow(
        {
          nodes: [
            { id: "in", op: "source" },
            { id: "split", op: operation, params },
            { id: "out", op: "output" },
          ],
          edges: [
            { source: "in", target: "split" },
            { source: "split", target: "out" },
          ],
        },
        { in: [studio.current] },
      );

      toast.success(`Split into ${run.files.length} files. Find them in Files.`, {
        action: run.files[0] ? { label: "Open first", onClick: () => onOpenFile(run.files[0].name) } : undefined,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not split the file.");
    } finally {
      setSplitBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-[0.85rem] text-fg-muted">
        {none ? "Click pages to select them." : `${selection.length} page${selection.length === 1 ? "" : "s"} selected: ${formatPages(selection)}`}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button disabled={none || studio.busy} onClick={() => run("rotate", { pages: selection, degrees: 270 }, "Rotated left")}>
          <RotateCcw className="size-4" strokeWidth={1.75} /> Rotate left
        </Button>
        <Button disabled={none || studio.busy} onClick={() => run("rotate", { pages: selection, degrees: 90 }, "Rotated right")}>
          <RotateCw className="size-4" strokeWidth={1.75} /> Rotate right
        </Button>
        <Button disabled={none || studio.busy} onClick={() => run("duplicate_pages", { pages: selection }, "Pages duplicated")}>
          <Copy className="size-4" strokeWidth={1.75} /> Duplicate
        </Button>
        <Button variant="danger" disabled={none || all || studio.busy} onClick={() => run("delete_pages", { pages: selection }, "Pages deleted")}>
          <Trash2 className="size-4" strokeWidth={1.75} /> Delete
        </Button>
        <Button className="col-span-2" disabled={none || studio.busy} onClick={() => run("extract_pages", { pages: selection }, "Kept only the selected pages")}>
          <FileText className="size-4" strokeWidth={1.75} /> Keep only these pages
        </Button>
      </div>

      {reordered && (
        <Notice>
          You moved pages around.
          <Button
            variant="primary"
            className="mt-2 w-full"
            disabled={studio.busy}
            onClick={() => run("reorder_pages", { order }, "New page order saved")}
          >
            Save the new order
          </Button>
        </Notice>
      )}

      <div className="border-t border-line pt-4">
        <Field label="Split into several files">
          <div className="flex items-center gap-2">
            <span className="text-[0.85rem] text-fg-muted">Every</span>
            <Input className="w-16 font-mono" value={every} onChange={(event) => setEvery(event.target.value)} aria-label="Pages per file" />
            <span className="text-[0.85rem] text-fg-muted">pages</span>
            <Button
              className="ml-auto"
              disabled={splitBusy || studio.busy}
              onClick={() => {
                const size = Math.max(1, Math.floor(Number(every)) || 1);
                const ranges: number[][] = [];

                for (let start = 1; start <= pageCount; start += size) ranges.push([start, Math.min(start + size - 1, pageCount)]);

                void splitWith("split", { ranges });
              }}
            >
              {splitBusy ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" strokeWidth={1.75} />}
              Split
            </Button>
          </div>
        </Field>
      </div>

      <div className="space-y-2 border-t border-line pt-4">
        <p className="text-[0.8rem] font-medium text-fg-muted">Scanned sheets</p>
        <Button
          className="w-full"
          disabled={studio.busy}
          onClick={async () => {
            const result = await studio.apply("remove_blank_pages", {});

            if (result) {
              toast.success(`${String(result.pages_removed)} blank page${result.pages_removed === 1 ? "" : "s"} removed`);
              onChanged();
            }
          }}
        >
          Remove blank pages
        </Button>
        <Button className="w-full" disabled={splitBusy || studio.busy} onClick={() => void splitWith("split_at_blanks", {})}>
          Split into files at blank pages
        </Button>
      </div>

      <p className="text-[0.78rem] text-fg-subtle">
        Shift-click selects a range. Drag a page to move it. Double-click opens a page.
      </p>
    </div>
  );
}

// ---------------------------------------------------------
// Add to pages
// ---------------------------------------------------------

const TOKEN_HELP = "Use {page}, {pages} and {date} to fill in the page number, page count and today's date.";

const POSITIONS = [
  { value: "bottom-center", label: "Bottom centre" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "top-center", label: "Top centre" },
  { value: "top-right", label: "Top right" },
];

function BackgroundForm({ studio }: { studio: Studio }) {
  const [color, setColor] = useState("#FFF8DC");
  const channels = (hex: string) => [1, 3, 5].map((i) => Number((parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(4)));

  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between">
        <span className="text-[0.85rem] font-medium">Colour behind the pages</span>
        <input
          type="color"
          value={color.toLowerCase()}
          onChange={(event) => setColor(event.target.value.toUpperCase())}
          className="h-8 w-12 cursor-pointer rounded-ctl border border-line-strong bg-surface p-0.5"
        />
      </label>
      <ApplyButton
        busy={studio.busy}
        onClick={async () => {
          const [red, green, blue] = channels(color);

          if (await studio.apply("background", { red, green, blue })) toast.success("Background added");
        }}
      >
        Add background
      </ApplyButton>
    </div>
  );
}

function TextForm({ studio, selection, pageNo, stage, patchStage, pageSize }: PanelProps) {
  const [text, setText] = useState("Sample text");
  const [size, setSize] = useState(18);
  const [color, setColor] = useState("#000000");
  const [scope, setScope] = useState<"all" | "selected">("all");

  useEffect(() => {
    patchStage({ text: { value: text, size, color } });
  }, [text, size, color]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = scope === "selected" ? (selection.length ? selection : [pageNo]) : undefined;

  return (
    <div className="space-y-4">
      <Field label="Text">
        <textarea
          value={text}
          rows={3}
          maxLength={1000}
          onChange={(event) => setText(event.target.value)}
          className="w-full resize-none rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-[0.85rem]"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Size ${size} pt`}>
          <input type="range" min={6} max={72} value={size} onChange={(event) => setSize(Number(event.target.value))} className="w-full accent-[var(--accent)]" />
        </Field>
        <Field label="Colour">
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-8 w-full cursor-pointer rounded-ctl border border-line-strong bg-surface p-0.5" />
        </Field>
      </div>
      <Segmented
        label="Apply to"
        value={scope}
        onChange={setScope}
        options={[
          { id: "all", label: "All pages" },
          { id: "selected", label: selection.length ? "Selected pages" : `Page ${pageNo}` },
        ]}
      />
      <p className="text-[0.78rem] text-fg-subtle">
        {stage.pick ? "Click the page to move the text." : "Click on the page to choose where the text goes."} {TOKEN_HELP}
      </p>
      <ApplyButton
        busy={studio.busy}
        disabled={!stage.pick || !text.trim() || !pageSize}
        onClick={async () => {
          if (!stage.pick) return;

          const result = await studio.apply("add_text", {
            text,
            x: Math.round(stage.pick.x * 10) / 10,
            y: Math.round(stage.pick.y * 10) / 10,
            font_size: size,
            color,
            pages,
          });

          if (result) {
            toast.success("Text added");
            patchStage({ pick: null });
          }
        }}
      >
        Add text
      </ApplyButton>
    </div>
  );
}

function ImageForm({ studio, selection, pageNo, stage, patchStage, pageSize }: PanelProps) {
  const [stored, setStored] = useState<{ name: string; label: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [widthPercent, setWidthPercent] = useState(30);
  const [scope, setScope] = useState<"all" | "selected">("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const pages = scope === "selected" ? (selection.length ? selection : [pageNo]) : undefined;
  const image = stage.image;

  async function choose(file?: File) {
    if (!file) return;

    setUploading(true);

    try {
      const url = URL.createObjectURL(file);
      const ratio = await new Promise<number>((resolve, reject) => {
        const probe = new Image();

        probe.onload = () => resolve(probe.naturalHeight / probe.naturalWidth);
        probe.onerror = () => reject(new Error("That image could not be read."));
        probe.src = url;
      });
      const record = await uploadFile(file);

      setStored({ name: record.name, label: file.name });
      patchStage({ image: { url, ratio, widthPercent } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add that image.");
    } finally {
      setUploading(false);

      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // The box in PDF points, centred on the click and kept on the page.
  function box() {
    if (!image || !stage.pick || !pageSize) return null;

    const width = Math.min((widthPercent / 100) * pageSize.width, pageSize.height / image.ratio);
    const height = width * image.ratio;
    const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(0, max));

    return {
      x: clamp(stage.pick.x - width / 2, pageSize.width - width),
      y: clamp(stage.pick.y - height / 2, pageSize.height - height),
      width: Math.floor(width * 10) / 10,
      height: Math.floor(height * 10) / 10,
    };
  }

  const placed = box();

  return (
    <div className="space-y-4">
      <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" className="hidden" onChange={(event) => void choose(event.target.files?.[0])} />
      <Button className="w-full" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading && <Loader2 className="size-4 animate-spin" />}
        {stored ? `Image: ${stored.label}` : "Choose a PNG or JPEG"}
      </Button>

      <Field label={`Width ${widthPercent}% of the page`}>
        <input
          type="range"
          min={5}
          max={100}
          value={widthPercent}
          onChange={(event) => {
            setWidthPercent(Number(event.target.value));
            if (image) patchStage({ image: { ...image, widthPercent: Number(event.target.value) } });
          }}
          className="w-full accent-[var(--accent)]"
        />
      </Field>
      <Segmented
        label="Apply to"
        value={scope}
        onChange={setScope}
        options={[
          { id: "all", label: "All pages" },
          { id: "selected", label: selection.length ? "Selected pages" : `Page ${pageNo}` },
        ]}
      />
      <p className="text-[0.78rem] text-fg-subtle">Click on the page to place the image. Its proportions are kept.</p>
      <ApplyButton
        busy={studio.busy}
        disabled={!stored || !placed}
        onClick={async () => {
          if (!stored || !placed) return;

          const result = await studio.apply("add_image", {
            image_filename: stored.name,
            x: Math.round(placed.x * 10) / 10,
            y: Math.round(placed.y * 10) / 10,
            width: placed.width,
            height: placed.height,
            pages,
          });

          if (result) {
            toast.success("Image added");
            patchStage({ pick: null });
          }
        }}
      >
        Add image
      </ApplyButton>
    </div>
  );
}

function FormForm({ studio }: { studio: Studio }) {
  const [fields, setFields] = useState<FormField[] | null>(null);
  const [initial, setInitial] = useState<Record<string, string | boolean>>({});
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [flatten, setFlatten] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getFormFields(studio.current)
      .then((list) => {
        if (cancelled) return;

        const start = Object.fromEntries(list.map((field) => [field.name, field.value]));

        setFields(list);
        setInitial(start);
        setValues(start);
      })
      .catch(() => {
        if (!cancelled) setFields([]);
      });

    return () => {
      cancelled = true;
    };
  }, [studio.current]); // eslint-disable-line react-hooks/exhaustive-deps

  if (fields === null) return <Loader2 className="size-4 animate-spin text-fg-subtle" />;

  const changed = Object.fromEntries(Object.entries(values).filter(([name, value]) => value !== initial[name]));
  const checked = (value: string | boolean) => value === true || ["true", "yes", "on", "1"].includes(String(value).toLowerCase());

  return (
    <div className="space-y-4">
      {fields.length === 0 ? (
        <p className="text-[0.85rem] text-fg-muted">This PDF has no form fields to fill.</p>
      ) : (
        <div className="space-y-3">
          {fields.map((field) => (
            <label key={field.name} className="block">
              <span className="mb-1 block text-[0.8rem] font-medium text-fg-muted">
                {field.name} <span className="font-normal text-fg-subtle">p.{field.page}</span>
              </span>
              {field.type === "CheckBox" || field.type === "RadioButton" ? (
                <input type="checkbox" checked={checked(values[field.name])} onChange={(event) => setValues({ ...values, [field.name]: event.target.checked })} className="size-4 accent-[var(--accent)]" />
              ) : field.choices.length > 0 ? (
                <select value={String(values[field.name] ?? "")} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })} className="h-8 w-full rounded-ctl border border-line-strong bg-surface px-2 text-[0.85rem]">
                  <option value="" />
                  {field.choices.map((choice) => (
                    <option key={choice}>{choice}</option>
                  ))}
                </select>
              ) : (
                <Input value={String(values[field.name] ?? "")} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })} />
              )}
            </label>
          ))}
        </div>
      )}
      <label className="flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" checked={flatten} onChange={(event) => setFlatten(event.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
        <span>
          <span className="block text-[0.85rem] font-medium">Flatten when done</span>
          <span className="block text-[0.75rem] text-fg-subtle">Turns the fields into plain page content, so they cannot be changed.</span>
        </span>
      </label>
      <ApplyButton
        busy={studio.busy}
        disabled={!flatten && Object.keys(changed).length === 0}
        onClick={async () => {
          const result = await studio.apply("fill_form", { values: changed, flatten });

          if (result) toast.success(flatten ? "Form filled and flattened" : "Form filled");
        }}
      >
        {flatten ? "Fill and flatten" : "Fill form"}
      </ApplyButton>
    </div>
  );
}

export function AddPanel(props: PanelProps) {
  const { studio, pageCount, mode, onMode } = props;
  const modes = [
    { id: "watermark", label: "Watermark" },
    { id: "text", label: "Text" },
    { id: "image", label: "Image" },
    { id: "numbers", label: "Numbers" },
    { id: "header", label: "Header" },
    { id: "background", label: "Colour" },
    { id: "crop", label: "Crop" },
    { id: "form", label: "Form" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {modes.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={mode === item.id}
            onClick={() => onMode(item.id)}
            className={`h-7 rounded-ctl border px-2.5 text-[0.8rem] font-medium transition-colors ${
              mode === item.id ? "border-accent bg-accent-soft text-accent" : "border-line-strong bg-surface text-fg-muted hover:bg-hover"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {mode === "watermark" && <OperationForm key={mode} studio={studio} operation="watermark" label="Add watermark" pageCount={pageCount} hints={{ text: { help: TOKEN_HELP } }} success="Watermark added" />}
      {mode === "numbers" && (
        <OperationForm key={mode} studio={studio} operation="page_numbers" label="Add page numbers" pageCount={pageCount} hints={{ position: { label: "Position", options: POSITIONS } }} success="Page numbers added" />
      )}
      {mode === "header" && <OperationForm key={mode} studio={studio} operation="header_footer" label="Add header and footer" pageCount={pageCount} hints={{ header: { help: TOKEN_HELP }, footer: { help: TOKEN_HELP } }} success="Header and footer added" />}
      {mode === "background" && <BackgroundForm key={mode} studio={studio} />}
      {mode === "crop" && (
        <OperationForm key={mode} studio={studio} operation="crop" label="Crop pages" pageCount={pageCount} hints={{ left: { label: "Left (pt)" }, bottom: { label: "Bottom (pt)" }, right: { label: "Right (pt)" }, top: { label: "Top (pt)" } }} success="Pages cropped" />
      )}
      {mode === "form" && <FormForm key={studio.current} studio={studio} />}
      {mode === "text" && <TextForm key={mode} {...props} />}
      {mode === "image" && <ImageForm key={mode} {...props} />}
    </div>
  );
}

// ---------------------------------------------------------
// Convert
// ---------------------------------------------------------

interface Converted {
  name: string;
  label: string;
  size: number;
}

export function ConvertPanel({ studio, mode, onMode }: PanelProps) {
  const [results, setResults] = useState<Converted[]>([]);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState("png");
  const [text, setText] = useState<ExtractedText | null>(null);
  const baseName = (studio.record?.original_name ?? "document").replace(/\.[^.]+$/, "");

  async function convert(operation: string, settings: Settings, label: string, extension: string) {
    setBusy(true);

    try {
      const result = await applyOperation(operation, studio.current, settings);

      setResults((existing) => [{ name: result.output_filename, label: `${baseName}${extension}`, size: result.output_size_bytes }, ...existing]);
      toast.success(`${label} is ready`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The conversion failed.");
    } finally {
      setBusy(false);
    }
  }

  const targets = [
    { id: "docx", label: "Word", note: ".docx, editable (best effort)", run: () => convert("to_docx", {}, "Word document", ".docx") },
    { id: "xlsx", label: "Excel", note: ".xlsx, tables as sheets", run: () => convert("to_xlsx", {}, "Excel workbook", ".xlsx") },
    { id: "pptx", label: "PowerPoint", note: ".pptx, one slide per page", run: () => convert("to_pptx", { dpi: 150 }, "PowerPoint file", ".pptx") },
    { id: "images", label: "Images", note: "One picture per page, in a ZIP", run: () => convert("to_images", { image_format: format, dpi: 150 }, "Images", "-images.zip") },
  ];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-box border border-line bg-surface">
        {targets.map((target) => (
          <div key={target.id} className={`flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0 ${mode === target.id ? "bg-accent-soft/40" : ""}`}>
            <div className="min-w-0 flex-1">
              <p className="text-[0.88rem] font-medium">{target.label}</p>
              <p className="text-[0.75rem] text-fg-subtle">{target.note}</p>
            </div>
            {target.id === "images" && (
              <select value={format} onChange={(event) => setFormat(event.target.value)} aria-label="Image format" className="h-8 rounded-ctl border border-line-strong bg-surface px-1.5 text-[0.8rem]">
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
              </select>
            )}
            <Button size="sm" disabled={busy} onClick={() => { onMode(target.id); void target.run(); }}>
              Convert
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[0.88rem] font-medium">Plain text</p>
            <p className="text-[0.75rem] text-fg-subtle">The selectable text of every page</p>
          </div>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              onMode("text");
              setBusy(true);

              try {
                setText(await extractText(studio.current));
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not read the text.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Show
          </Button>
        </div>
      </div>

      {results.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-[0.8rem] font-semibold text-fg-muted">Ready to download</h3>
          <ul className="space-y-1">
            {results.map((item) => (
              <li key={item.name} className="flex items-center gap-2 rounded-ctl border border-line bg-surface px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[0.82rem]">{item.label}</span>
                <span className="font-mono text-[0.72rem] text-fg-subtle">{formatSize(item.size)}</span>
                <a href={getFileDownloadUrl(item.name, item.label)} download aria-label={`Download ${item.label}`} className="rounded-ctl p-1 text-fg-muted hover:bg-hover hover:text-fg">
                  <Download className="size-4" strokeWidth={1.75} />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[0.75rem] text-fg-subtle">These also appear in Files.</p>
        </div>
      )}

      {mode === "text" && text && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-[0.8rem] font-semibold text-fg-muted">{text.total_characters.toLocaleString()} characters</h3>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(text.pages.map((p) => p.text.trim()).join("\n\n")).then(() => toast.success("Copied"))}>Copy</Button>
              <Button size="sm" variant="ghost" onClick={() => setText(null)} aria-label="Close text"><X className="size-4" /></Button>
            </div>
          </div>
          {text.total_characters === 0 ? (
            <Notice tone="warning">No selectable text. This is probably a scan; text recognition is planned.</Notice>
          ) : (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-ctl border border-line bg-surface p-2.5 font-sans text-[0.8rem] leading-relaxed">
              {text.pages.map((page) => `— Page ${page.page_number} —\n${page.text.trim()}`).join("\n\n")}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// Protect
// ---------------------------------------------------------

export function ProtectPanel(props: PanelProps) {
  const { studio, pageCount, mode, onMode, stage, patchStage } = props;
  const [terms, setTerms] = useState("");
  const termList = [...new Set(terms.split("\n").map((term) => term.trim()).filter(Boolean))];

  return (
    <div className="space-y-4">
      <Segmented
        label="Protection"
        value={mode as "password" | "unlock" | "redact"}
        onChange={onMode}
        options={[
          { id: "password", label: "Password" },
          { id: "unlock", label: "Unlock" },
          { id: "redact", label: "Redact" },
        ]}
      />

      {mode === "password" && (
        <>
          <OperationForm
            key="protect"
            studio={studio}
            operation="protect"
            label="Protect with password"
            pageCount={pageCount}
            hints={{
              user_password: { label: "Password to open" },
              owner_password: { label: "Owner password (optional)", help: "Lets you change permissions later." },
              allow_printing: { label: "Allow printing" },
              allow_copying: { label: "Allow copying text and images" },
              allow_modifying: { label: "Allow editing" },
              allow_annotations: { label: "Allow comments and forms" },
            }}
            success="Password added"
          />
          <p className="text-[0.78rem] text-fg-subtle">AES-256. There is no password recovery.</p>
        </>
      )}

      {mode === "unlock" && (
        <OperationForm key="unlock" studio={studio} operation="unlock" label="Remove the password" pageCount={pageCount} hints={{ password: { help: "Leave empty if the file only restricts printing or editing." } }} success="Unlocked" />
      )}

      {mode === "redact" && (
        <div className="space-y-4">
          <Field label="Words to remove everywhere (one per line)">
            <textarea value={terms} rows={3} onChange={(event) => setTerms(event.target.value)} className="w-full resize-none rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-[0.85rem]" />
          </Field>
          <div>
            <h3 className="mb-1.5 text-[0.8rem] font-semibold text-fg-muted">Marked areas ({stage.regions.length})</h3>
            {stage.regions.length === 0 ? (
              <p className="text-[0.8rem] text-fg-subtle">Drag on the page to mark an area.</p>
            ) : (
              <ul className="max-h-32 space-y-1 overflow-y-auto">
                {stage.regions.map((region) => (
                  <li key={region.id} className="flex items-center justify-between rounded-ctl bg-hover px-2.5 py-1 text-[0.8rem]">
                    Page {region.page} · {Math.round(region.x1 - region.x0)} × {Math.round(region.y1 - region.y0)} pt
                    <button type="button" aria-label="Remove area" onClick={() => patchStage({ regions: stage.regions.filter((item) => item.id !== region.id) })} className="text-fg-subtle hover:text-danger">
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Notice tone="warning">Redaction permanently deletes the covered content from the new version. The original version stays in the history until the files are removed.</Notice>
          <ApplyButton
            busy={studio.busy}
            disabled={stage.regions.length === 0 && termList.length === 0}
            onClick={async () => {
              const result = await studio.apply("redact", {
                regions: stage.regions.map(({ page, x0, y0, x1, y1 }) => ({ page, x0, y0, x1, y1 })),
                terms: termList,
              });

              if (result) {
                toast.success("Redactions applied");
                patchStage({ regions: [] });
                setTerms("");
              }
            }}
          >
            Permanently redact
          </ApplyButton>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// Smaller and clean
// ---------------------------------------------------------

const LEVELS = [
  { id: "lossless", name: "Lossless", note: "Repacks the file. Looks identical." },
  { id: "balanced", name: "Balanced", note: "Images at 150 DPI. Good for screens and email." },
  { id: "strong", name: "Strong", note: "Images at 96 DPI. Smallest file, softer images." },
];

export function OptimizePanel({ studio }: PanelProps) {
  const [level, setLevel] = useState("balanced");
  const [target, setTarget] = useState("5");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {LEVELS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={level === item.id}
            onClick={() => setLevel(item.id)}
            className={`w-full rounded-box border p-3 text-left transition-colors ${level === item.id ? "border-accent bg-accent-soft/50" : "border-line bg-surface hover:border-line-strong"}`}
          >
            <span className="block text-[0.88rem] font-semibold">{item.name}</span>
            <span className="block text-[0.78rem] text-fg-subtle">{item.note}</span>
          </button>
        ))}
      </div>
      <p className="font-mono text-[0.78rem] text-fg-muted">Now: {studio.record ? formatSize(studio.record.size_bytes) : "..."}</p>
      <ApplyButton
        busy={studio.busy}
        onClick={async () => {
          const before = studio.record?.size_bytes ?? 0;
          const result = await studio.apply("compress", { level }, `Made smaller (${level})`);

          if (result) {
            toast.success(`${formatSize(before)} to ${formatSize(result.output_size_bytes)}`);
          }
        }}
      >
        Make smaller
      </ApplyButton>

      <div className="space-y-2 border-t border-line pt-4">
        <Field label="Or aim for a size">
          <div className="flex items-center gap-2">
            <span className="text-[0.85rem] text-fg-muted">Under</span>
            <Input className="w-20 font-mono" value={target} onChange={(event) => setTarget(event.target.value)} aria-label="Target size in megabytes" />
            <span className="text-[0.85rem] text-fg-muted">MB</span>
            <Button
              className="ml-auto"
              disabled={studio.busy}
              onClick={async () => {
                const megabytes = Number(target);

                if (!(megabytes > 0)) {
                  toast.error("Enter a size above zero.");

                  return;
                }

                const result = await studio.apply("compress_to_target", { target_mb: megabytes }, "Made smaller to fit");

                if (result?.target_met) toast.success(`${formatSize(result.output_size_bytes)} (${String(result.level)})`);
                else if (result) toast.warning(`Could not get under ${megabytes} MB. The smallest possible is ${formatSize(result.output_size_bytes)}.`);
              }}
            >
              Shrink to fit
            </Button>
          </div>
        </Field>
        <p className="text-[0.75rem] text-fg-subtle">Tries the gentlest level first and stops at the first that fits.</p>
      </div>
    </div>
  );
}

function DetailsEditor({ studio }: { studio: Studio }) {
  const meta = studio.info?.metadata;
  const [details, setDetails] = useState({
    title: meta?.title ?? "",
    author: meta?.author ?? "",
    subject: meta?.subject ?? "",
    keywords: meta?.keywords ?? "",
  });
  const labels: [keyof typeof details, string][] = [
    ["title", "Title"],
    ["author", "Author"],
    ["subject", "Subject"],
    ["keywords", "Keywords"],
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-[0.8rem] font-semibold text-fg-muted">Change the details</h3>
      {labels.map(([key, label]) => (
        <Field key={key} label={label}>
          <Input value={details[key]} maxLength={300} onChange={(event) => setDetails({ ...details, [key]: event.target.value })} />
        </Field>
      ))}
      <ApplyButton
        busy={studio.busy}
        onClick={async () => {
          if (await studio.apply("edit_metadata", details)) toast.success("Details saved");
        }}
      >
        Save details
      </ApplyButton>
    </div>
  );
}

export function CleanPanel({ studio, pageCount }: PanelProps) {
  const meta = studio.info?.metadata;
  const rows: [string, string | null | undefined][] = [
    ["Title", meta?.title],
    ["Author", meta?.author],
    ["Created with", meta?.creator],
    ["Producer", meta?.producer],
    ["PDF version", studio.info?.pdf_version],
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-box border border-line bg-surface px-3 py-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-line py-1.5 text-[0.82rem] last:border-b-0">
            <span className="text-fg-muted">{label}</span>
            <span className={value ? "truncate" : "text-fg-subtle"}>{value || "Not set"}</span>
          </div>
        ))}
      </div>
      <OperationForm
        studio={studio}
        operation="sanitize"
        label="Clean the document"
        pageCount={pageCount}
        hints={{
          metadata: { label: "Author and document properties" },
          javascript: { label: "Scripts and auto-run actions" },
          attachments: { label: "Attached files" },
          annotations: { label: "Comments and notes" },
          links: { label: "Links" },
          hidden_text: { label: "Hidden text" },
          form_data: { label: "Form field values" },
        }}
        success="Document cleaned"
      />
      <div className="border-t border-line pt-4">
        <DetailsEditor key={studio.current} studio={studio} />
      </div>
    </div>
  );
}
