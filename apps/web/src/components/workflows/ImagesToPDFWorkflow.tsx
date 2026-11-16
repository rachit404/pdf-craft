"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Image as ImageIcon, X } from "lucide-react";

import {
  getDownloadUrl,
  imagesToPDF,
  uploadImage,
  type ConversionResponse,
} from "@/lib/api";

import FileDropzone from "./shared/FileDropzone";
import {
  ErrorBanner,
  formatSize,
  Notice,
  ResultCard,
  SubmitButton,
  WorkflowShell,
} from "./shared/ui";

const MAX_IMAGES = 100;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

interface Item {
  id: string;
  name: string;
  size: number;
  /** Local thumbnail (revoked when the item is removed). */
  url: string;
  storedFilename: string;
}

export default function ImagesToPDFWorkflow({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConversionResponse | null>(null);

  // Revoke any remaining thumbnails when leaving the tool.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(
    () => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url)),
    [],
  );

  const busy = uploading || processing;

  async function handleSelect(files: File[]) {
    setResult(null);
    setError("");

    if (items.length + files.length > MAX_IMAGES) {
      setError(`You can combine at most ${MAX_IMAGES} images.`);
      return;
    }

    setUploading(true);
    const added: Item[] = [];
    const failures: string[] = [];

    for (const file of files) {
      try {
        const uploaded = await uploadImage(file);

        added.push({
          id: uploaded.stored_filename,
          name: file.name,
          size: file.size,
          url: URL.createObjectURL(file),
          storedFilename: uploaded.stored_filename,
        });
      } catch (err) {
        failures.push(
          `${file.name}: ${err instanceof Error ? err.message : "upload failed"}`,
        );
      }
    }

    setItems((current) => [...current, ...added]);
    if (failures.length) setError(failures.join(" · "));
    setUploading(false);
  }

  function edit(update: (current: Item[]) => Item[]) {
    setItems(update);
    setResult(null);
    setError("");
  }

  function remove(id: string) {
    const removed = items.find((item) => item.id === id);
    if (removed) URL.revokeObjectURL(removed.url);

    edit((current) => current.filter((item) => item.id !== id));
  }

  function move(index: number, offset: -1 | 1) {
    edit((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }

  async function handleConvert() {
    setResult(null);
    setError("");
    setProcessing(true);

    try {
      setResult(await imagesToPDF(items.map((item) => item.storedFilename)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <WorkflowShell
      icon={ImageIcon}
      title="Images to PDF"
      description="Combine PNG and JPEG images into one PDF, one image per page, in the order shown."
      onBack={onBack}
    >
      <section className="space-y-6">
        <FileDropzone
          title="Drop your images here"
          hint={`PNG or JPEG · up to ${MAX_IMAGES} images · 10 MB each`}
          accept=".png,.jpg,.jpeg,image/png,image/jpeg"
          extensions={[".png", ".jpg", ".jpeg"]}
          maxBytes={MAX_IMAGE_BYTES}
          multiple
          busy={uploading}
          busyLabel="Uploading images..."
          buttonLabel={items.length ? "Add more images" : "Select images"}
          onSelect={(files) => void handleSelect(files)}
          onError={setError}
        />

        {items.length > 0 && (
          <>
            <ol className="space-y-2">
              {items.map((item, index) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3"
                >
                  <span className="w-6 text-center text-xs font-semibold text-gray-400">
                    {index + 1}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
                  <img
                    src={item.url}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg border border-gray-200 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-500">{formatSize(item.size)}</p>
                  </div>

                  <button
                    onClick={() => move(index, -1)}
                    disabled={busy || index === 0}
                    aria-label={`Move ${item.name} up`}
                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={busy || index === items.length - 1}
                    aria-label={`Move ${item.name} down`}
                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    onClick={() => remove(item.id)}
                    disabled={busy}
                    aria-label={`Remove ${item.name}`}
                    className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ol>

            <Notice>
              Each page is sized to fit A4 and matches its image&apos;s
              orientation. Photos are rotated upright using their camera
              orientation, and JPEGs are embedded without losing quality.
            </Notice>

            <SubmitButton
              label={`Create PDF from ${items.length} image${items.length === 1 ? "" : "s"}`}
              busyLabel="Creating PDF..."
              icon={ImageIcon}
              busy={processing}
              disabled={uploading}
              onClick={() => void handleConvert()}
            />
          </>
        )}
      </section>

      <ErrorBanner message={error} />

      {result && (
        <ResultCard
          title="PDF created"
          detail={`${result.page_count} pages · ${formatSize(result.output_size_bytes)}`}
          href={getDownloadUrl(result.output_filename, "images.pdf")}
          downloadLabel="Download PDF"
        />
      )}
    </WorkflowShell>
  );
}
