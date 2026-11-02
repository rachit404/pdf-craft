
from pathlib import Path
from typing import Any

from pypdf import PdfReader
from pypdf.errors import PdfReadError


def extract_pdf_text(file_path: Path) -> dict[str, Any]:
    """Extract selectable text from each page of a local PDF."""
    if not file_path.is_file():
        raise FileNotFoundError("PDF file was not found.")

    try:
        reader = PdfReader(str(file_path), strict=True)

        if reader.is_encrypted:
            raise ValueError("Encrypted PDFs are not supported yet.")

        pages = []

        for page_number, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""

            pages.append(
                {
                    "page_number": page_number,
                    "text": text,
                }
            )

        return {
            "filename": file_path.name,
            "page_count": len(pages),
            "pages": pages,
            "total_characters": sum(len(page["text"]) for page in pages),
        }

    except PdfReadError as exc:
        raise ValueError("The file could not be read as a valid PDF.") from exc
