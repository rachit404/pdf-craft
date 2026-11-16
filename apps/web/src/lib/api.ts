const API_BASE = "/api/backend";

export interface UploadedPDF {
  original_filename: string;
  stored_filename: string;
  size_bytes: number;
}

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

export interface PDFOperationResponse {
  message: string;
  output_filename: string;
  output_size_bytes: number;
  page_count: number;
}

export interface MergeResponse extends PDFOperationResponse {
  source_count: number;
  total_pages: number;
}

export interface SplitResponse {
  message: string;
  output_filename: string;
  output_size_bytes: number;
  parts: number;
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

async function postOperation<T = PDFOperationResponse>(
  filename: string,
  operation: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(
    `${API_BASE}/operations/${encodeURIComponent(filename)}/${operation}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  return handleResponse<T>(response);
}

export async function uploadPDF(file: File): Promise<UploadedPDF> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/uploads`, {
    method: "POST",
    body: formData,
  });

  return handleResponse<UploadedPDF>(response);
}

export async function inspectPDF(filename: string): Promise<PDFInfo> {
  const response = await fetch(
    `${API_BASE}/uploads/${encodeURIComponent(filename)}/info`,
  );

  return handleResponse<PDFInfo>(response);
}

export async function mergePDFs(filenames: string[]): Promise<MergeResponse> {
  const response = await fetch(`${API_BASE}/operations/merge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filenames }),
  });

  return handleResponse<MergeResponse>(response);
}

export async function splitPDF(
  filename: string,
  ranges: number[][],
): Promise<SplitResponse> {
  const response = await fetch(
    `${API_BASE}/operations/${encodeURIComponent(filename)}/split`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ranges }),
    },
  );

  return handleResponse<SplitResponse>(response);
}

export async function extractPages(
  filename: string,
  pages: number[],
): Promise<PDFOperationResponse> {
  const response = await fetch(
    `${API_BASE}/operations/${encodeURIComponent(filename)}/extract-pages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pages }),
    },
  );

  return handleResponse<PDFOperationResponse>(response);
}

export async function reorderPDF(
  filename: string,
  order: number[],
): Promise<PDFOperationResponse> {
  const response = await fetch(
    `${API_BASE}/operations/${encodeURIComponent(filename)}/reorder-pages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order }),
    },
  );

  return handleResponse<PDFOperationResponse>(response);
}

export async function deletePages(
  filename: string,
  pages: number[],
): Promise<PDFOperationResponse> {
  const response = await fetch(
    `${API_BASE}/operations/${encodeURIComponent(filename)}/delete-pages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pages }),
    },
  );

  return handleResponse<PDFOperationResponse>(response);
}

export async function rotatePDF(
  filename: string,
  pages: number[],
  degrees: number,
): Promise<PDFOperationResponse> {
  const response = await fetch(
    `${API_BASE}/operations/${encodeURIComponent(filename)}/rotate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pages, degrees }),
    },
  );

  return handleResponse<PDFOperationResponse>(response);
}

export async function watermarkPDF(
  filename: string,
  text: string,
  opacity: number,
  fontSize: number,
): Promise<PDFOperationResponse> {
  const response = await fetch(
    `${API_BASE}/operations/${encodeURIComponent(filename)}/watermark`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        opacity,
        font_size: fontSize,
      }),
    },
  );

  return handleResponse<PDFOperationResponse>(response);
}

export async function numberPDFPages(
  filename: string,
  position: string,
  fontSize: number,
): Promise<PDFOperationResponse> {
  const response = await fetch(
    `${API_BASE}/operations/${encodeURIComponent(filename)}/page-numbers`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        position,
        font_size: fontSize,
      }),
    },
  );

  return handleResponse<PDFOperationResponse>(response);
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

export interface UploadedImage {
  original_filename: string;
  stored_filename: string;
  size_bytes: number;
}

export interface PagePreview {
  /** Object URL of the rendered page; release it with URL.revokeObjectURL. */
  url: string;
  /** Page size in PDF points. */
  width: number;
  height: number;
}

export async function uploadImage(file: File): Promise<UploadedImage> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/uploads/image`, {
    method: "POST",
    body: formData,
  });

  return handleResponse<UploadedImage>(response);
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

export const duplicatePages = (filename: string, pages: number[]) =>
  postOperation(filename, "duplicate-pages", { pages });

export type CompressionLevel = "lossless" | "balanced" | "strong";

export interface CompressResponse {
  output_filename: string;
  output_size_bytes: number;
  level: CompressionLevel;
  original_size_bytes: number;
  saved_bytes: number;
  reduction_percent: number;
}

export async function compressPDF(
  filename: string,
  level: CompressionLevel,
): Promise<CompressResponse> {
  const response = await fetch(
    `${API_BASE}/uploads/${encodeURIComponent(filename)}/compress`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level }),
    },
  );

  return handleResponse<CompressResponse>(response);
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

/** One produced file in the history. */
export interface HistoryEntry {
  public_id: string;
  /** Last segment of the API route, e.g. "rotate" or "to-docx". */
  operation: string;
  status: string;
  original_filename: string | null;
  output_filename: string | null;
  created_at: string;
  /** null once the file has been deleted. */
  output_size_bytes: number | null;
}

export async function listHistory(): Promise<HistoryEntry[]> {
  return handleResponse<HistoryEntry[]>(await fetch(`${API_BASE}/jobs?limit=100`));
}

export async function deleteHistoryEntry(publicId: string): Promise<void> {
  await handleResponse(
    await fetch(`${API_BASE}/jobs/${encodeURIComponent(publicId)}`, {
      method: "DELETE",
    }),
  );
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

async function postSecurity<T>(
  filename: string,
  operation: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    `${API_BASE}/security/${encodeURIComponent(filename)}/${operation}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    },
  );

  return handleResponse<T>(response);
}

export interface SecurityResult {
  output_filename: string;
  output_size_bytes: number;
  message: string;
}

export interface ProtectOptions {
  userPassword: string;
  ownerPassword?: string;
  allowPrinting: boolean;
  allowCopying: boolean;
  allowModifying: boolean;
  allowAnnotations: boolean;
}

export const protectPDF = (filename: string, options: ProtectOptions) =>
  postSecurity<SecurityResult>(filename, "protect", {
    user_password: options.userPassword,
    owner_password: options.ownerPassword || null,
    allow_printing: options.allowPrinting,
    allow_copying: options.allowCopying,
    allow_modifying: options.allowModifying,
    allow_annotations: options.allowAnnotations,
  });

export interface UnlockResponse extends SecurityResult {
  was_encrypted: boolean;
}

export const unlockPDF = (filename: string, password: string) =>
  postSecurity<UnlockResponse>(filename, "unlock", { password });

/** Rectangle in points, origin at the top-left of the unrotated page. */
export interface RedactionRegion {
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RedactResponse extends SecurityResult {
  areas_redacted: number;
  search_matches: number;
}

export const redactPDF = (
  filename: string,
  regions: RedactionRegion[],
  terms: string[],
) => postSecurity<RedactResponse>(filename, "redact", { regions, terms });

export interface SanitizeOptions {
  metadata: boolean;
  javascript: boolean;
  attachments: boolean;
  annotations: boolean;
  links: boolean;
  hiddenText: boolean;
  formData: boolean;
}

export interface SanitizeResponse extends SecurityResult {
  metadata_removed: boolean;
  attachments_removed: number;
  annotations_removed: number;
  links_removed: number;
}

export const sanitizePDF = (filename: string, options: SanitizeOptions) =>
  postSecurity<SanitizeResponse>(filename, "sanitize", {
    metadata: options.metadata,
    javascript: options.javascript,
    attachments: options.attachments,
    annotations: options.annotations,
    links: options.links,
    hidden_text: options.hiddenText,
    form_data: options.formData,
  });

export interface AddTextOptions {
  text: string;
  /** PDF points from the bottom-left corner of the visible page. */
  x: number;
  y: number;
  fontSize: number;
  color: string;
  /** 1-based pages; omit for every page. */
  pages?: number[];
}

export function addTextToPDF(filename: string, options: AddTextOptions) {
  const { fontSize, ...rest } = options;

  return postOperation(filename, "add-text", { ...rest, font_size: fontSize });
}

export interface AddImageOptions {
  imageFilename: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pages?: number[];
}

export function addImageToPDF(filename: string, options: AddImageOptions) {
  const { imageFilename, ...rest } = options;

  return postOperation(filename, "add-image", {
    ...rest,
    image_filename: imageFilename,
  });
}

export function addHeaderFooter(
  filename: string,
  header: string | null,
  footer: string | null,
) {
  return postOperation(filename, "header-footer", { header, footer });
}

export function addBackground(
  filename: string,
  red: number,
  green: number,
  blue: number,
) {
  return postOperation(filename, "background", { red, green, blue });
}

export interface CropMargins {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

export function cropPDF(filename: string, margins: CropMargins) {
  return postOperation(filename, "crop", margins);
}

export interface ConversionResponse {
  output_filename: string;
  output_size_bytes: number;
  page_count?: number;
  slide_count?: number;
  tables_extracted?: number;
  /** "libreoffice" or "basic_text_only" for Word/PowerPoint to PDF. */
  conversion_mode?: string;
}

async function postConversion(path: string, body?: unknown) {
  const response = await fetch(`${API_BASE}/conversions/${path}`, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return handleResponse<ConversionResponse>(response);
}

const pdfPath = (filename: string, target: string) =>
  `${encodeURIComponent(filename)}/${target}`;

export const pdfToImages = (filename: string, imageFormat: "png" | "jpeg", dpi: number) =>
  postConversion(pdfPath(filename, "to-images"), { image_format: imageFormat, dpi });

export const pdfToDocx = (filename: string) =>
  postConversion(pdfPath(filename, "to-docx"));

export const pdfToXlsx = (filename: string) =>
  postConversion(pdfPath(filename, "to-xlsx"));

export const pdfToPptx = (filename: string, dpi: number) =>
  postConversion(pdfPath(filename, "to-pptx"), { dpi });

export const imagesToPDF = (filenames: string[]) =>
  postConversion("images-to-pdf", { filenames });

/** Word/PowerPoint are sent with the request; nothing is stored afterwards. */
export async function officeToPDF(
  kind: "docx" | "pptx",
  file: File,
): Promise<ConversionResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/conversions/${kind}-to-pdf`, {
    method: "POST",
    body: formData,
  });

  return handleResponse<ConversionResponse>(response);
}

export async function getOfficeEngine(): Promise<"libreoffice" | "basic"> {
  const response = await fetch(`${API_BASE}/conversions/capabilities`);

  return (await handleResponse<{ office_engine: "libreoffice" | "basic" }>(response))
    .office_engine;
}

/** `name` is the file name the browser saves it as (the extension is kept). */
export function getDownloadUrl(filename: string, name?: string): string {
  const url = `${API_BASE}/outputs/${encodeURIComponent(filename)}`;

  return name ? `${url}?name=${encodeURIComponent(name)}` : url;
}
