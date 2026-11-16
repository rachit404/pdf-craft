"use client";

import { useEffect, useState } from "react";
import { ImagePlus, X } from "lucide-react";

import { addImageToPDF, getDownloadUrl, uploadImage } from "@/lib/api";

import FileDropzone from "./shared/FileDropzone";
import PagePreview, { type PageSize } from "./shared/PagePreview";
import PDFDropzone from "./shared/PDFDropzone";
import { usePDFWorkflow } from "./shared/usePDFWorkflow";
import {
  ErrorBanner,
  FileChip,
  formatSize,
  ResultCard,
  ScopeToggle,
  SubmitButton,
  WorkflowShell,
} from "./shared/ui";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

interface StampImage {
  storedFilename: string;
  name: string;
  /** Local preview URL (revoked when the image is replaced). */
  url: string;
  /** Height divided by width. */
  ratio: number;
}

function measure(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image.naturalHeight / image.naturalWidth);
    image.onerror = () => reject(new Error("The image could not be read."));
    image.src = url;
  });
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

export default function AddImageWorkflow({ onBack }: { onBack: () => void }) {
  const workflow = usePDFWorkflow();
  const { file, info, processing, result } = workflow;

  const [image, setImage] = useState<StampImage | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [widthPercent, setWidthPercent] = useState(30);
  const [scope, setScope] = useState<"all" | "current">("all");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<PageSize | null>(null);
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null);

  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image.url);
    },
    [image],
  );

  function change(update: () => void) {
    update();
    workflow.clearResult();
  }

  /** Image box in PDF points, kept fully inside the page. */
  function placement(pageSize: PageSize) {
    if (!image || !center) return null;

    const width = Math.min(
      (widthPercent / 100) * pageSize.width,
      pageSize.height / image.ratio,
    );
    const height = width * image.ratio;

    return {
      width,
      height,
      x: clamp(center.x - width / 2, 0, pageSize.width - width),
      y: clamp(center.y - height / 2, 0, pageSize.height - height),
    };
  }

  async function handleImage(selected: File) {
    workflow.clearResult();
    setLoadingImage(true);

    const url = URL.createObjectURL(selected);

    try {
      const [ratio, uploaded] = await Promise.all([
        measure(url),
        uploadImage(selected),
      ]);

      setImage({
        storedFilename: uploaded.stored_filename,
        name: selected.name,
        url,
        ratio,
      });
    } catch (err) {
      URL.revokeObjectURL(url);
      workflow.setError(
        err instanceof Error ? err.message : "Could not upload the image.",
      );
    } finally {
      setLoadingImage(false);
    }
  }

  const box = size ? placement(size) : null;

  function handleSubmit() {
    if (!image || !box) {
      workflow.setError("Choose an image and click the page to place it.");
      return;
    }

    void workflow.run((filename) =>
      addImageToPDF(filename, {
        imageFilename: image.storedFilename,
        x: Math.round(box.x * 10) / 10,
        y: Math.round(box.y * 10) / 10,
        // Rounded down so rounding never pushes the image past the page edge.
        width: Math.floor(box.width * 10) / 10,
        height: Math.floor(box.height * 10) / 10,
        pages: scope === "current" ? [page] : undefined,
      }),
    );
  }

  return (
    <WorkflowShell
      icon={ImagePlus}
      title="Add Image"
      description="Place a PNG or JPEG logo, signature or picture on your PDF."
      onBack={onBack}
    >
      {!file || !info ? (
        <PDFDropzone workflow={workflow} />
      ) : (
        <section className="space-y-6">
          <FileChip
            name={file.original_filename}
            detail={`${formatSize(file.size_bytes)} · ${info.page_count} pages`}
            disabled={processing}
            onRemove={() => {
              workflow.reset();
              setImage(null);
              setCenter(null);
              setPage(1);
            }}
          />

          {!image ? (
            <FileDropzone
              title="Drop your image here"
              hint="PNG or JPEG · Maximum 10 MB"
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              extensions={[".png", ".jpg", ".jpeg"]}
              maxBytes={MAX_IMAGE_BYTES}
              busy={loadingImage}
              busyLabel="Uploading image..."
              buttonLabel="Select image"
              onSelect={(selected) => void handleImage(selected)}
              onError={workflow.setError}
            />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <PagePreview
                  filename={file.stored_filename}
                  pageCount={info.page_count}
                  page={page}
                  onPageChange={(next) => change(() => setPage(next))}
                  onLoad={setSize}
                  onPick={(x, y) => change(() => setCenter({ x, y }))}
                >
                  {(pageSize) => {
                    const placed = placement(pageSize);

                    return (
                      placed && (
                        // eslint-disable-next-line @next/next/no-img-element -- local blob URL
                        <img
                          src={image.url}
                          alt="Image placement"
                          className="absolute"
                          style={{
                            left: `${(placed.x / pageSize.width) * 100}%`,
                            top: `${((pageSize.height - placed.y - placed.height) / pageSize.height) * 100}%`,
                            width: `${(placed.width / pageSize.width) * 100}%`,
                            height: `${(placed.height / pageSize.height) * 100}%`,
                          }}
                        />
                      )
                    );
                  }}
                </PagePreview>

                <p className="mt-3 text-center text-xs text-gray-400">
                  {center
                    ? "Click elsewhere to move the image"
                    : "Click the page to place the image"}
                </p>
              </div>

              <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
                  <img
                    src={image.url}
                    alt=""
                    className="h-12 w-12 rounded-lg border border-gray-200 bg-white object-contain"
                  />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                    {image.name}
                  </p>
                  <button
                    onClick={() => change(() => setImage(null))}
                    disabled={processing}
                    aria-label="Remove image"
                    className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="image-width"
                      className="text-sm font-medium text-gray-700"
                    >
                      Width
                    </label>
                    <span className="text-sm font-semibold text-violet-700">
                      {widthPercent}% of page
                    </span>
                  </div>
                  <input
                    id="image-width"
                    type="range"
                    min={5}
                    max={100}
                    value={widthPercent}
                    disabled={processing}
                    onChange={(event) =>
                      change(() => setWidthPercent(Number(event.target.value)))
                    }
                    className="mt-3 w-full accent-violet-600"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    The aspect ratio is always preserved.
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-gray-700">
                    Apply to
                  </p>
                  <ScopeToggle
                    value={scope}
                    page={page}
                    disabled={processing}
                    onChange={(value) => change(() => setScope(value))}
                  />
                </div>
              </div>
            </div>
          )}

          <SubmitButton
            label="Add image"
            busyLabel="Adding image..."
            icon={ImagePlus}
            busy={processing}
            disabled={!image || !box}
            onClick={handleSubmit}
          />
        </section>
      )}

      <ErrorBanner message={workflow.error} />

      {result && (
        <ResultCard
          title="Image added successfully"
          detail={`${result.page_count} pages · ${formatSize(result.output_size_bytes)}`}
          href={getDownloadUrl(result.output_filename)}
          downloadLabel="Download PDF"
        />
      )}
    </WorkflowShell>
  );
}
