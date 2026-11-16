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
  /** Colour multiplied over the page to approximate a background fill. */
  tint?: string;
  /**
   * Overlay drawn over the page. The wrapper establishes a container, so use
   * `cqw` units (1cqw = 1% of the page width) for sizes that scale with it.
   */
  children?: (size: PageSize) => ReactNode;
}

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
  tint,
  children,
}: PagePreviewProps) {
  const key = `${filename}:${page}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);

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

  return (
    <div className="mx-auto w-full max-w-md">
      <div
        onClick={handleClick}
        style={{
          aspectRatio: current ? `${current.width} / ${current.height}` : "3 / 4",
          backgroundColor: tint ?? "#ffffff",
        }}
        className={`relative overflow-hidden rounded-md border border-gray-200 shadow-sm ${
          onPick ? "cursor-crosshair" : ""
        }`}
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
