"use client";

import { useState } from "react";
import { Type } from "lucide-react";

import { addTextToPDF, getDownloadUrl } from "@/lib/api";

import PagePreview, { type PageSize } from "./shared/PagePreview";
import PDFDropzone from "./shared/PDFDropzone";
import { usePDFWorkflow } from "./shared/usePDFWorkflow";
import {
  ErrorBanner,
  FileChip,
  formatSize,
  inputClass,
  ResultCard,
  ScopeToggle,
  SubmitButton,
  WorkflowShell,
} from "./shared/ui";

const LINE_HEIGHT = 1.2;

export default function AddTextWorkflow({ onBack }: { onBack: () => void }) {
  const workflow = usePDFWorkflow();
  const { file, info, processing, result } = workflow;

  const [text, setText] = useState("Sample text");
  const [fontSize, setFontSize] = useState(18);
  const [color, setColor] = useState("#000000");
  const [scope, setScope] = useState<"all" | "current">("all");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<PageSize | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );

  const ready = Boolean(text.trim() && position);

  function change(update: () => void) {
    update();
    workflow.clearResult();
  }

  function handleSubmit() {
    if (!position || !text.trim()) {
      workflow.setError("Enter some text and click the page to place it.");
      return;
    }

    void workflow.run((filename) =>
      addTextToPDF(filename, {
        text,
        x: Math.round(position.x * 10) / 10,
        y: Math.round(position.y * 10) / 10,
        fontSize,
        color,
        pages: scope === "current" ? [page] : undefined,
      }),
    );
  }

  return (
    <WorkflowShell
      icon={Type}
      title="Add Text"
      description="Click the page to choose where your text goes, then apply it to one page or all of them."
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
              setPosition(null);
              setPage(1);
            }}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <PagePreview
                filename={file.stored_filename}
                pageCount={info.page_count}
                page={page}
                onPageChange={(next) => change(() => setPage(next))}
                onLoad={setSize}
                onPick={(x, y) => change(() => setPosition({ x, y }))}
              >
                {(pageSize) =>
                  position && (
                    <div
                      className="absolute whitespace-pre"
                      style={{
                        left: `${(position.x / pageSize.width) * 100}%`,
                        top: `${(1 - position.y / pageSize.height) * 100}%`,
                        fontSize: `${(fontSize / pageSize.width) * 100}cqw`,
                        lineHeight: LINE_HEIGHT,
                        fontFamily: "Helvetica, Arial, sans-serif",
                        color,
                        // Align the first baseline with the click point.
                        transform: "translateY(-0.95em)",
                      }}
                    >
                      {text}
                    </div>
                  )
                }
              </PagePreview>

              <p className="mt-3 text-center text-xs text-gray-400">
                {position
                  ? `Placed at ${Math.round(position.x)} pt, ${Math.round(position.y)} pt${size ? ` on a ${Math.round(size.width)} × ${Math.round(size.height)} pt page` : ""}`
                  : "Click the page to place the text"}
              </p>
            </div>

            <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
              <div>
                <label
                  htmlFor="text"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Text
                </label>
                <textarea
                  id="text"
                  value={text}
                  rows={3}
                  maxLength={1000}
                  disabled={processing}
                  onChange={(event) => change(() => setText(event.target.value))}
                  className={`${inputClass} h-auto resize-none py-3`}
                />
                <p className="mt-1 text-xs text-gray-400">
                  Latin characters only · {text.length}/1000
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="font-size"
                    className="text-sm font-medium text-gray-700"
                  >
                    Font size
                  </label>
                  <span className="text-sm font-semibold text-violet-700">
                    {fontSize} pt
                  </span>
                </div>
                <input
                  id="font-size"
                  type="range"
                  min={6}
                  max={72}
                  value={fontSize}
                  disabled={processing}
                  onChange={(event) =>
                    change(() => setFontSize(Number(event.target.value)))
                  }
                  className="mt-3 w-full accent-violet-600"
                />
              </div>

              <div className="flex items-center justify-between">
                <label
                  htmlFor="color"
                  className="text-sm font-medium text-gray-700"
                >
                  Colour
                </label>
                <input
                  id="color"
                  type="color"
                  value={color}
                  disabled={processing}
                  onChange={(event) => change(() => setColor(event.target.value))}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">Apply to</p>
                <ScopeToggle
                  value={scope}
                  page={page}
                  disabled={processing}
                  onChange={(value) => change(() => setScope(value))}
                />
              </div>
            </div>
          </div>

          <SubmitButton
            label="Add text"
            busyLabel="Adding text..."
            icon={Type}
            busy={processing}
            disabled={!ready}
            onClick={handleSubmit}
          />
        </section>
      )}

      <ErrorBanner message={workflow.error} />

      {result && (
        <ResultCard
          title="Text added successfully"
          detail={`${result.page_count} pages · ${formatSize(result.output_size_bytes)}`}
          href={getDownloadUrl(result.output_filename)}
          downloadLabel="Download PDF"
        />
      )}
    </WorkflowShell>
  );
}
