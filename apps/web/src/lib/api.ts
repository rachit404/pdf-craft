const API_BASE = "/api/backend";

export interface PDFInfo {
  filename: string;
  size_bytes: number;
  page_count: number;
  pdf_version: string;
  /** First page, in points. */
  page_size: { width: number; height: number } | null;
  mixed_page_sizes: boolean;
  metadata: {
    title: string | null;
    author: string | null;
    subject: string | null;
    keywords: string | null;
    creator: string | null;
    producer: string | null;
    /** ISO date strings. */
    created: string | null;
    modified: string | null;
  };
}

/** Fired when the server says the session ended; the app shows the sign-in page. */
export const UNAUTHORIZED_EVENT = "pdfcraft:unauthorized";

async function readError(response: Response): Promise<Error> {
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  let message = `Request failed (${response.status})`;

  try {
    const body = await response.json();
    const detail = body.detail ?? body.message;

    // FastAPI validation errors arrive as a list of { msg } objects.
    message = Array.isArray(detail)
      ? detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join("; ") || message
      : detail || message;
  } catch {
    // Keep the HTTP status message.
  }

  return new Error(message);
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw await readError(response);

  return response.json() as Promise<T>;
}

export async function inspectPDF(filename: string): Promise<PDFInfo> {
  const response = await fetch(
    `${API_BASE}/uploads/${encodeURIComponent(filename)}/info`,
  );

  return handleResponse<PDFInfo>(response);
}

export async function getAuthStatus(): Promise<{
  auth_required: boolean;
  authenticated: boolean;
}> {
  return handleResponse(await fetch(`${API_BASE}/auth/status`));
}

export async function signIn(password: string): Promise<void> {
  await handleResponse(
    await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }),
  );
}

export async function signOut(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
}

export interface PagePreview {
  /** Object URL of the rendered page; release it with URL.revokeObjectURL. */
  url: string;
  /** Page size in PDF points. */
  width: number;
  height: number;
}

export async function fetchPagePreview(
  filename: string,
  page: number,
  width = 900,
): Promise<PagePreview> {
  const response = await fetch(
    `${API_BASE}/uploads/${encodeURIComponent(filename)}/pages/${page}/preview?width=${width}`,
  );

  if (!response.ok) throw await readError(response);

  return {
    url: URL.createObjectURL(await response.blob()),
    width: Number(response.headers.get("X-Page-Width")),
    height: Number(response.headers.get("X-Page-Height")),
  };
}

export interface ExtractedText {
  page_count: number;
  total_characters: number;
  pages: { page_number: number; text: string }[];
}

export async function extractText(filename: string): Promise<ExtractedText> {
  const response = await fetch(
    `${API_BASE}/uploads/${encodeURIComponent(filename)}/text`,
  );

  return handleResponse<ExtractedText>(response);
}

/** A file in storage: an upload or a result, with where it came from. */
export interface StoredFileInfo {
  name: string;
  kind: string;
  original_name: string;
  size_bytes: number;
  parent_name: string | null;
  root_name: string;
  operation: string | null;
  created_at: string;
  /** null when files are kept until deleted by hand. */
  expires_at: string | null;
  available: boolean;
}

export async function listFiles(): Promise<StoredFileInfo[]> {
  return handleResponse<StoredFileInfo[]>(await fetch(`${API_BASE}/files?limit=200`));
}

export async function deleteFile(name: string): Promise<void> {
  await handleResponse(
    await fetch(`${API_BASE}/files/${encodeURIComponent(name)}`, { method: "DELETE" }),
  );
}

/** Download link for any stored file; `friendlyName` is what the browser saves it as. */
export function getFileDownloadUrl(name: string, friendlyName?: string): string {
  const url = `${API_BASE}/files/${encodeURIComponent(name)}/download`;

  return friendlyName ? `${url}?name=${encodeURIComponent(friendlyName)}` : url;
}

/** Deletes every stored upload and output on the server. */
export async function deleteAllFiles(): Promise<number> {
  const response = await fetch(`${API_BASE}/jobs`, { method: "DELETE" });

  return (await handleResponse<{ files_deleted: number }>(response)).files_deleted;
}

/** Hours files are kept before automatic deletion; 0 means forever. */
export async function getRetentionHours(): Promise<number> {
  const response = await fetch(`${API_BASE}/jobs/retention`);

  return (await handleResponse<{ retention_hours: number }>(response)).retention_hours;
}

/** Rectangle in points, origin at the top-left of the unrotated page. */
export interface RedactionRegion {
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// ---------------------------------------------------------
// Studio: the file library and operations on any stored file
// ---------------------------------------------------------

/** Store any supported file (PDF, image, Word, PowerPoint). */
export async function uploadFile(file: File): Promise<StoredFileInfo> {
  const formData = new FormData();
  formData.append("file", file);

  return handleResponse<StoredFileInfo>(
    await fetch(`${API_BASE}/files`, { method: "POST", body: formData }),
  );
}

export async function getFileInfo(name: string): Promise<StoredFileInfo> {
  return handleResponse<StoredFileInfo>(
    await fetch(`${API_BASE}/files/${encodeURIComponent(name)}`),
  );
}

/** The versions leading to a file, original first. */
export async function getVersions(name: string): Promise<StoredFileInfo[]> {
  return handleResponse<StoredFileInfo[]>(
    await fetch(`${API_BASE}/files/${encodeURIComponent(name)}/versions`),
  );
}

/** Thumbnail URL; the browser caches it per file version. */
export function pageThumbnailUrl(name: string, page: number, width = 240): string {
  return `${API_BASE}/uploads/${encodeURIComponent(name)}/pages/${page}/preview?width=${width}&as_displayed=true`;
}

/** Where each registry operation lives. The body is the operation settings. */
const OPERATION_ROUTES: Record<string, (file: string) => string> = {
  split: (f) => `/operations/${f}/split`,
  extract_pages: (f) => `/operations/${f}/extract-pages`,
  reorder_pages: (f) => `/operations/${f}/reorder-pages`,
  delete_pages: (f) => `/operations/${f}/delete-pages`,
  duplicate_pages: (f) => `/operations/${f}/duplicate-pages`,
  rotate: (f) => `/operations/${f}/rotate`,
  watermark: (f) => `/operations/${f}/watermark`,
  page_numbers: (f) => `/operations/${f}/page-numbers`,
  header_footer: (f) => `/operations/${f}/header-footer`,
  background: (f) => `/operations/${f}/background`,
  crop: (f) => `/operations/${f}/crop`,
  add_text: (f) => `/operations/${f}/add-text`,
  add_image: (f) => `/operations/${f}/add-image`,
  compress: (f) => `/uploads/${f}/compress`,
  protect: (f) => `/security/${f}/protect`,
  unlock: (f) => `/security/${f}/unlock`,
  redact: (f) => `/security/${f}/redact`,
  sanitize: (f) => `/security/${f}/sanitize`,
  to_images: (f) => `/conversions/${f}/to-images`,
  to_docx: (f) => `/conversions/${f}/to-docx`,
  to_xlsx: (f) => `/conversions/${f}/to-xlsx`,
  to_pptx: (f) => `/conversions/${f}/to-pptx`,
};

export interface OperationResult {
  output_filename: string;
  output_size_bytes: number;
  [key: string]: unknown;
}

/** Run one operation on a stored file (an upload or an earlier result). */
export async function applyOperation(
  operation: string,
  file: string,
  settings: Record<string, unknown> = {},
): Promise<OperationResult> {
  const route = OPERATION_ROUTES[operation];

  if (!route) throw new Error(`Unknown operation: ${operation}`);

  const response = await fetch(`${API_BASE}${route(encodeURIComponent(file))}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });

  return handleResponse<OperationResult>(response);
}

export async function mergeFiles(names: string[]): Promise<OperationResult> {
  return handleResponse<OperationResult>(
    await fetch(`${API_BASE}/operations/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filenames: names }),
    }),
  );
}

export interface FlowRunInfo {
  id: string;
  status: string;
  error: string | null;
  outputs: string[];
  files: StoredFileInfo[];
}

/** Run a flow on the server and wait for it to finish. */
export async function runFlow(
  definition: unknown,
  inputs: Record<string, string[]>,
): Promise<FlowRunInfo> {
  const started = await handleResponse<{ id: string }>(
    await fetch(`${API_BASE}/flows/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ definition, inputs }),
    }),
  );

  for (let attempt = 0; attempt < 240; attempt++) {
    const run = await handleResponse<FlowRunInfo>(
      await fetch(`${API_BASE}/flows/runs/${started.id}`),
    );

    if (["done", "failed", "cancelled"].includes(run.status)) {
      if (run.status !== "done") throw new Error(run.error ?? "The run did not finish.");

      return run;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("The run took too long.");
}

export interface OperationSpec {
  id: string;
  label: string;
  category: string;
  description: string;
  params_schema: {
    properties?: Record<string, JsonSchemaField>;
    required?: string[];
  };
}

export interface JsonSchemaField {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: { type?: string };
  anyOf?: JsonSchemaField[];
}

let registryCache: Promise<OperationSpec[]> | null = null;

/** Every tool the server offers, with a JSON Schema of its settings. */
export function getRegistry(): Promise<OperationSpec[]> {
  registryCache ??= fetch(`${API_BASE}/registry/operations`)
    .then((response) => handleResponse<OperationSpec[]>(response))
    .catch((error: unknown) => {
      registryCache = null;
      throw error;
    });

  return registryCache;
}

/** Make one PDF from images, one page per image, in order. */
export async function imagesToPDF(names: string[]): Promise<OperationResult> {
  return handleResponse<OperationResult>(
    await fetch(`${API_BASE}/conversions/images-to-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filenames: names }),
    }),
  );
}
