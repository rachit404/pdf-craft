/** What operations are called, and where each tool lives in the Studio. */

/** API route segment or registry id to what the user sees. */
export const OPERATION_NAMES: Record<string, string> = {
  merge: "Merged",
  split: "Split",
  "extract-pages": "Pages extracted",
  "reorder-pages": "Reordered",
  "delete-pages": "Pages deleted",
  "duplicate-pages": "Pages duplicated",
  rotate: "Rotated",
  compress: "Made smaller",
  watermark: "Watermarked",
  "page-numbers": "Page numbers added",
  "header-footer": "Header and footer added",
  background: "Background added",
  crop: "Cropped",
  "add-text": "Text added",
  "add-image": "Image added",
  "to-images": "Converted to images",
  "images-to-pdf": "Created from images",
  "to-docx": "Converted to Word",
  "to-xlsx": "Converted to Excel",
  "to-pptx": "Converted to PowerPoint",
  "docx-to-pdf": "Converted to PDF",
  "pptx-to-pdf": "Converted to PDF",
  protect: "Password added",
  unlock: "Unlocked",
  redact: "Redacted",
  sanitize: "Cleaned",
  "remove-blank-pages": "Blank pages removed",
  "flatten-forms": "Form flattened",
  "fill-form": "Form filled",
  "edit-metadata": "Details changed",
  "compress-to-target": "Made smaller to fit",
};

export function operationName(operation: string | null): string {
  if (!operation) return "Uploaded";

  return OPERATION_NAMES[operation.replace(/_/g, "-")] ?? operation;
}

export type StudioTool = "pages" | "add" | "convert" | "protect" | "optimize" | "clean";

/** Sub-mode of a Studio tool, e.g. which "Add" option is open. */
export type StudioMode = string;

export interface StudioTarget {
  tool: StudioTool;
  mode?: StudioMode;
}

/** Where each catalogue tool opens. Tools that start from several files open the file list. */
export const TOOL_TARGETS: Record<string, StudioTarget | "files"> = {
  merge: "files",
  "images-to-pdf": "files",
  "docx-to-pdf": "files",
  "pptx-to-pdf": "files",
  split: { tool: "pages" },
  extract: { tool: "pages" },
  reorder: { tool: "pages" },
  rotate: { tool: "pages" },
  delete: { tool: "pages" },
  duplicate: { tool: "pages" },
  compress: { tool: "optimize" },
  "pdf-info": { tool: "clean" },
  watermark: { tool: "add", mode: "watermark" },
  "page-numbers": { tool: "add", mode: "numbers" },
  "header-footer": { tool: "add", mode: "header" },
  background: { tool: "add", mode: "background" },
  crop: { tool: "add", mode: "crop" },
  "add-text": { tool: "add", mode: "text" },
  "add-image": { tool: "add", mode: "image" },
  "pdf-to-images": { tool: "convert", mode: "images" },
  "pdf-to-docx": { tool: "convert", mode: "docx" },
  "pdf-to-xlsx": { tool: "convert", mode: "xlsx" },
  "pdf-to-pptx": { tool: "convert", mode: "pptx" },
  "extract-text": { tool: "convert", mode: "text" },
  protect: { tool: "protect", mode: "password" },
  unlock: { tool: "protect", mode: "unlock" },
  redact: { tool: "protect", mode: "redact" },
  sanitize: { tool: "clean" },
  "remove-blank-pages": { tool: "pages" },
  "fill-form": { tool: "add", mode: "form" },
};
