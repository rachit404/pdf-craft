"use client";

import {
  ArrowLeft,
  Download,
  Eraser,
  Layers,
  Loader2,
  LayoutGrid,
  Lock,
  PenLine,
  Redo2,
  Repeat,
  Shrink,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import Button from "@/components/ui/Button";
import PasswordInput from "@/components/ui/PasswordInput";
import { deleteFile, getFileDownloadUrl } from "@/lib/api";
import { formatSize, timeLeft } from "@/lib/format";
import type { StudioTool } from "@/lib/operations";
import type { Route } from "@/lib/route";
import { cn } from "@/lib/utils";

import PageGrid from "./PageGrid";
import PagePreview, { type PageSize } from "./PagePreview";
import {
  AddPanel,
  CleanPanel,
  ConvertPanel,
  EMPTY_STAGE,
  OptimizePanel,
  PagesPanel,
  ProtectPanel,
  type PanelProps,
  type Stage,
} from "./panels";
import { useStudio } from "./useStudio";

const TOOLS: { id: StudioTool; label: string; icon: LucideIcon; defaultMode?: string }[] = [
  { id: "pages", label: "Pages", icon: LayoutGrid },
  { id: "add", label: "Add", icon: PenLine, defaultMode: "watermark" },
  { id: "convert", label: "Convert", icon: Repeat, defaultMode: "docx" },
  { id: "protect", label: "Protect", icon: Lock, defaultMode: "password" },
  { id: "optimize", label: "Smaller", icon: Shrink },
  { id: "clean", label: "Clean", icon: Eraser },
];

const PANELS: Record<StudioTool, (props: PanelProps) => React.ReactNode> = {
  pages: PagesPanel,
  add: AddPanel,
  convert: ConvertPanel,
  protect: ProtectPanel,
  optimize: OptimizePanel,
  clean: CleanPanel,
};

interface StudioPageProps {
  file: string;
  tool?: string;
  mode?: string;
  navigate: (route: Route) => void;
}

/** One document open for editing: pages in the middle, the active tool on the right. */
export default function StudioPage({ file, tool: toolParam, mode: modeParam, navigate }: StudioPageProps) {
  const studio = useStudio(file);
  const tool = (TOOLS.find((item) => item.id === toolParam)?.id ?? "pages") as StudioTool;
  const mode = modeParam ?? TOOLS.find((item) => item.id === tool)?.defaultMode ?? "";
  const pageCount = studio.info?.page_count ?? 0;

  const [order, setOrder] = useState<number[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [lastClicked, setLastClicked] = useState<number | null>(null);
  const [viewPage, setViewPage] = useState<number | null>(null);
  const [pageNo, setPageNo] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize | null>(null);
  const [stage, setStage] = useState<Stage>(EMPTY_STAGE);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [now, setNow] = useState(() => Date.now());

  // A new version means new pages: start the page list over (adjusting state while rendering).
  const documentKey = `${studio.current}:${pageCount}`;
  const [seenDocument, setSeenDocument] = useState(documentKey);

  if (seenDocument !== documentKey) {
    setSeenDocument(documentKey);
    setOrder(Array.from({ length: pageCount }, (_, index) => index + 1));
    setSelected(new Set());
    setLastClicked(null);
    setPageNo((page) => Math.min(Math.max(page, 1), Math.max(pageCount, 1)));
    setViewPage((page) => (page && page > pageCount ? null : page));
    setStage((existing) => ({ ...existing, pick: null, regions: [] }));
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (studio.error) toast.error(studio.error);
  }, [studio.error]);

  const patchStage = useCallback((patch: Partial<Stage>) => setStage((existing) => ({ ...existing, ...patch })), []);

  const needsPage = (tool === "add" && (mode === "text" || mode === "image")) || (tool === "protect" && mode === "redact");
  const single = needsPage || viewPage !== null;

  // Leaving a placing mode clears what was being placed.
  const placingKey = `${needsPage}:${mode}`;
  const [seenPlacing, setSeenPlacing] = useState(placingKey);

  if (seenPlacing !== placingKey) {
    setSeenPlacing(placingKey);
    setStage((existing) => ({ ...existing, pick: null, text: null, image: null }));
  }

  function openTool(next: StudioTool, nextMode?: string) {
    const defaultMode = TOOLS.find((item) => item.id === next)?.defaultMode;

    navigate({ name: "studio", file, tool: next, mode: nextMode ?? defaultMode });
  }

  function toggle(page: number, extend: boolean) {
    setSelected((existing) => {
      const next = new Set(existing);

      if (extend && lastClicked !== null) {
        const from = order.indexOf(lastClicked);
        const to = order.indexOf(page);

        for (const entry of order.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(entry);
      } else if (next.has(page)) {
        next.delete(page);
      } else {
        next.add(page);
      }

      return next;
    });
    setLastClicked(page);
  }

  const selection = useMemo(() => order.filter((page) => selected.has(page)).sort((a, b) => a - b), [order, selected]);
  const recordName = studio.record?.original_name ?? "document.pdf";
  const left = timeLeft(studio.record?.expires_at ?? null, now);
  const Panel = PANELS[tool];

  const panelProps: PanelProps = {
    studio,
    pageCount,
    pageNo,
    selection,
    mode,
    onMode: (next) => openTool(tool, next),
    stage,
    patchStage,
    pageSize,
    order,
    onChanged: () => setSelected(new Set()),
    onOpenFile: (name) => navigate({ name: "studio", file: name }),
  };

  async function deleteNow() {
    try {
      for (const version of studio.versions) await deleteFile(version.name).catch(() => undefined);
      toast.success("Deleted from the server");
      navigate({ name: "files" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete.");
    }
  }

  // Locked PDF: nothing can be shown until it is opened.
  if (!studio.loading && studio.readError) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 px-5 py-16">
        <div className="flex items-center gap-2 text-[1rem] font-semibold">
          <Lock className="size-5 text-accent" strokeWidth={1.75} /> This file cannot be opened yet
        </div>
        <p className="text-[0.85rem] text-fg-muted">{studio.readError}</p>
        <PasswordInput id="studio-unlock" label="Password" value={unlockPassword} onChange={setUnlockPassword} />
        <Button
          variant="primary"
          size="lg"
          disabled={studio.busy || !unlockPassword}
          onClick={async () => {
            if (await studio.apply("unlock", { password: unlockPassword })) setUnlockPassword("");
          }}
        >
          {studio.busy && <Loader2 className="size-4 animate-spin" />} Unlock
        </Button>
        <Button variant="ghost" onClick={() => navigate({ name: "files" })}>
          <ArrowLeft className="size-4" /> Back to files
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
        <Button variant="ghost" size="icon" aria-label="Back to files" onClick={() => navigate({ name: "files" })}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <p className="truncate text-[0.88rem] font-semibold">{recordName}</p>
        </div>
        <span className="rounded-ctl bg-hover px-1.5 py-0.5 font-mono text-[0.7rem] text-fg-muted">
          v{studio.index + 1}/{studio.versions.length}
        </span>
        {studio.record && (
          <span className="hidden font-mono text-[0.72rem] text-fg-subtle sm:inline">
            {pageCount} p · {formatSize(studio.record.size_bytes)}
          </span>
        )}
        <span className="flex-1" />
        <Button variant="ghost" size="icon" aria-label="Undo" disabled={!studio.canUndo || studio.busy} onClick={studio.undo}>
          <Undo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Redo" disabled={!studio.canRedo || studio.busy} onClick={studio.redo}>
          <Redo2 className="size-4" />
        </Button>
        <span className={cn("hidden font-mono text-[0.72rem] md:inline", left.soon ? "text-warn" : "text-fg-subtle")}>
          {studio.record?.expires_at ? `removed in ${left.text}` : "kept until deleted"}
        </span>
        {confirmDelete ? (
          <>
            <Button variant="danger" size="sm" onClick={() => void deleteNow()}>Delete all versions</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" strokeWidth={1.75} />
            <span className="hidden sm:inline">Delete now</span>
          </Button>
        )}
        <a
          href={getFileDownloadUrl(studio.current, recordName)}
          download
          className="inline-flex h-8 items-center gap-1.5 rounded-ctl border border-accent bg-accent px-3 text-[0.85rem] font-medium text-on-accent hover:bg-accent-hover"
        >
          <Download className="size-4" strokeWidth={1.75} /> Download
        </a>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Tool rail */}
        <nav aria-label="Tools" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.label}
              aria-label={item.label}
              aria-current={tool === item.id ? "true" : undefined}
              onClick={() => {
                setViewPage(null);
                openTool(item.id);
              }}
              className={cn(
                "flex w-12 flex-col items-center gap-0.5 rounded-ctl py-1.5 text-[0.65rem] font-medium transition-colors",
                tool === item.id ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-hover hover:text-fg",
              )}
            >
              <item.icon className="size-[1.1rem]" strokeWidth={1.75} />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Pages */}
        <section className="relative min-w-0 flex-1 overflow-y-auto bg-canvas" aria-label="Pages">
          {studio.loading || !pageCount ? (
            <div className="flex h-full items-center justify-center text-fg-subtle">
              <Loader2 className="animate-spin" />
            </div>
          ) : single ? (
            <div className="p-5">
              {!needsPage && (
                <Button variant="ghost" size="sm" className="mb-2" onClick={() => setViewPage(null)}>
                  <LayoutGrid className="size-4" /> All pages
                </Button>
              )}
              <PagePreview
                filename={studio.current}
                pageCount={pageCount}
                page={pageNo}
                onPageChange={(page) => setPageNo(Math.min(Math.max(page, 1), pageCount))}
                onLoad={setPageSize}
                widthClass="max-w-xl"
                onPick={tool === "add" && (mode === "text" || mode === "image") ? (x, y) => patchStage({ pick: { x, y } }) : undefined}
                onDrawRect={
                  tool === "protect" && mode === "redact"
                    ? (rect) => patchStage({ regions: [...stage.regions, { id: Date.now(), page: pageNo, ...rect }] })
                    : undefined
                }
              >
                {(size) => (
                  <>
                    {stage.regions
                      .filter((region) => region.page === pageNo)
                      .map((region) => (
                        <div
                          key={region.id}
                          className="absolute bg-black/80"
                          style={{
                            left: `${(region.x0 / size.width) * 100}%`,
                            top: `${(region.y0 / size.height) * 100}%`,
                            width: `${((region.x1 - region.x0) / size.width) * 100}%`,
                            height: `${((region.y1 - region.y0) / size.height) * 100}%`,
                          }}
                        />
                      ))}
                    {stage.pick && stage.text && mode === "text" && (
                      <div
                        className="absolute whitespace-pre leading-none"
                        style={{
                          left: `${(stage.pick.x / size.width) * 100}%`,
                          bottom: `${(stage.pick.y / size.height) * 100}%`,
                          fontSize: `${(stage.text.size / size.width) * 100}cqw`,
                          color: stage.text.color,
                        }}
                      >
                        {stage.text.value}
                      </div>
                    )}
                    {stage.pick && stage.image && mode === "image" && (
                      <div
                        className="absolute -translate-x-1/2 translate-y-1/2 outline outline-1 outline-dashed outline-[var(--accent)]"
                        style={{
                          left: `${(stage.pick.x / size.width) * 100}%`,
                          bottom: `${(stage.pick.y / size.height) * 100}%`,
                          width: `${stage.image.widthPercent}%`,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                        <img src={stage.image.url} alt="" className="block w-full opacity-80" />
                      </div>
                    )}
                  </>
                )}
              </PagePreview>
            </div>
          ) : (
            <PageGrid
              file={studio.current}
              order={order}
              onOrder={setOrder}
              selected={selected}
              onToggle={toggle}
              onOpen={(page) => {
                setPageNo(page);
                setViewPage(page);
              }}
            />
          )}
          {studio.busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-ground/50">
              <Loader2 className="size-6 animate-spin text-accent" />
            </div>
          )}
        </section>

        {/* Options */}
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-line bg-panel p-4 lg:w-80" aria-label="Options">
          <h2 className="mb-3 text-[0.95rem] font-semibold">{TOOLS.find((item) => item.id === tool)?.label}</h2>
          {studio.loading || !pageCount ? null : <Panel {...panelProps} />}
        </aside>
      </div>

      {/* Versions */}
      <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-t border-line bg-panel px-3" aria-label="Versions">
        <Layers className="mr-1 size-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
        {studio.versions.map((version, position) => (
          <button
            key={version.name}
            type="button"
            disabled={studio.busy}
            onClick={() => studio.goto(position)}
            aria-current={position === studio.index ? "true" : undefined}
            className={cn(
              "h-6 shrink-0 rounded-ctl px-2 text-[0.75rem] font-medium",
              position === studio.index ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-hover",
              position > studio.index && "opacity-60",
            )}
          >
            {position + 1}. {version.label}
          </button>
        ))}
      </div>
    </div>
  );
}
