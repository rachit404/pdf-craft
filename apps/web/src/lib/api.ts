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
  metadata: {
    title: string | null;
    author: string | null;
    subject: string | null;
    creator: string | null;
    producer: string | null;
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

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;

    try {
      const body = await response.json();
      message = body.detail || body.message || message;
    } catch {
      // Keep the HTTP status message.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
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

export function getDownloadUrl(filename: string): string {
  return `${API_BASE}/outputs/${encodeURIComponent(filename)}`;
}
