"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { fetchPagePreview } from "@/lib/api";

export interface PageSize {
  /** Page size in PDF points. */
  width: number;
  height: number;
}

interface PagePreviewProps {
  filename: string;
  pageCount: number;
  page: number;
  onPageChange: (page: number) => void;
  /** Receives the page size once rendered. Pass a stable function. */
  onLoad?: (size: PageSize) => void;
  /** Click position in PDF points from the page's bottom-left corner. */
  onPick?: (x: number, y: number) => void;
  /** Rectangle dragged by the user, in points from the page top-left corner. */
  onDrawRect?: (rect: { x0: number; y0: number; x1: number; y1: number }) => void;
  /** Colour multiplied over the page to approximate a background fill. */
  tint?: string;
  /**
   * Overlay drawn over the page. The wrapper establishes a container, so use
   * `cqw` units (1cqw = 1% of the page width) for sizes that scale with it.
   */
  children?: (size: PageSize) => ReactNode;
}

type Point = { x: number; y: number };
type Draft = { from: Point; to: Point };
type Loaded = PageSize & { key: string; url: string };
type Failed = { key: string; message: string };

/** Page image with a pager and a point-accurate overlay layer. */
export default function PagePreview({
  filename,
  pageCount,
  page,
  onPageChange,
  onLoad,
  onPick,
  onDrawRect,
  tint,
  children,
}: PagePreviewProps) {
  const key = `${filename}:${page}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    fetchPagePreview(filename, page)
      .then((preview) => {
        if (cancelled) {
          URL.revokeObjectURL(preview.url);
          return;
        }

        objectUrl = preview.url;
        setLoaded({ key, ...preview });
        onLoad?.({ width: preview.width, height: preview.height });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFailed({
            key,
            message: err instanceof Error ? err.message : "Preview failed.",
          });
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [filename, page, key, onLoad]);

  const current = loaded?.key === key ? loaded : null;
  const message = failed?.key === key ? failed.message : "";

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!onPick || !current) return;

    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * current.width;
    const y = (1 - (event.clientY - box.top) / box.height) * current.height;

    onPick(
      Math.min(Math.max(x, 0), current.width),
      Math.min(Math.max(y, 0), current.height),
    );
  }

  /** Pointer position as a 0-1 fraction of the page, clamped to the page. */
  function fraction(event: React.PointerEvent<HTMLDivElement>): Point {
    const box = event.currentTarget.getBoundingClientRect();
    const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

    return {
      x: clamp((event.clientX - box.left) / box.width),
      y: clamp((event.clientY - box.top) / box.height),
    };
  }

  function finishDraw() {
    if (!draft || !current || !onDrawRect) return;

    const rect = {
      x0: Math.min(draft.from.x, draft.to.x) * current.width,
      y0: Math.min(draft.from.y, draft.to.y) * current.height,
      x1: Math.max(draft.from.x, draft.to.x) * current.width,
      y1: Math.max(draft.from.y, draft.to.y) * current.height,
    };

    setDraft(null);

    // Ignore accidental clicks and tiny drags.
    if (rect.x1 - rect.x0 >= 4 && rect.y1 - rect.y0 >= 4) onDrawRect(rect);
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div
        onClick={handleClick}
        onPointerDown={(event) => {
          if (!onDrawRect || !current) return;

          event.currentTarget.setPointerCapture(event.pointerId);
          const point = fraction(event);
          setDraft({ from: point, to: point });
        }}
        onPointerMove={(event) => {
          const point = fraction(event);
          setDraft((current) => current && { from: current.from, to: point });
        }}
        onPointerUp={finishDraw}
        onPointerCancel={() => setDraft(null)}
        style={{
          aspectRatio: current ? `${current.width} / ${current.height}` : "3 / 4",
          backgroundColor: tint ?? "#ffffff",
        }}
        className={`relative overflow-hidden rounded-md border border-gray-200 shadow-sm ${
          onPick || onDrawRect ? "cursor-crosshair" : ""
        } ${onDrawRect ? "touch-none select-none" : ""}`}
      >
        {current && (
          // eslint-disable-next-line @next/next/no-img-element -- blob URL, not optimizable
          <img
            src={current.url}
            alt={`Page ${page} preview`}
            draggable={false}
            className={`absolute inset-0 h-full w-full select-none ${
              tint ? "mix-blend-multiply" : ""
            }`}
          />
        )}

        {current && children && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ containerType: "inline-size" }}
          >
            {children(current)}
          </div>
        )}

        {draft && (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-violet-600 bg-violet-500/20"
            style={{
              left: `${Math.min(draft.from.x, draft.to.x) * 100}%`,
              top: `${Math.min(draft.from.y, draft.to.y) * 100}%`,
              width: `${Math.abs(draft.to.x - draft.from.x) * 100}%`,
              height: `${Math.abs(draft.to.y - draft.from.y) * 100}%`,
            }}
          />
        )}

        {!current && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-gray-400">
            {message || <Loader2 className="animate-spin" />}
          </div>
        )}
      </div>

      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3 text-sm text-gray-600">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className="rounded-lg p-2 hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronLeft size={18} />
          </button>

          <span>
            Page {page} of {pageCount}
          </span>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
            className="rounded-lg p-2 hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
