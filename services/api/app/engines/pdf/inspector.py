
from pathlib import Path
from typing import Any

from pypdf import PdfReader

from app.engines.pdf.errors import ENCRYPTED_PDF_MESSAGE


def _date(metadata, attribute: str) -> str | None:
    """ISO date from the metadata, or None when missing or malformed."""
    try:
        value = getattr(metadata, attribute)
    except Exception:
        return None

    return value.isoformat() if value else None


def inspect_pdf(file_path: Path) -> dict[str, Any]:
    """Return document details and metadata for a readable PDF."""
    if not file_path.is_file():
        raise FileNotFoundError("PDF file was not found.")

    reader = PdfReader(str(file_path), strict=False)

    if reader.is_encrypted:
        raise ValueError(ENCRYPTED_PDF_MESSAGE)

    metadata = reader.metadata
    sizes = [
        (round(float(page.cropbox.width), 1), round(float(page.cropbox.height), 1))
        for page in reader.pages
    ]

    return {
        "filename": file_path.name,
        "size_bytes": file_path.stat().st_size,
        "page_count": len(sizes),
        "pdf_version": reader.pdf_header.removeprefix("%PDF-"),
        # Size of the first page in points; `mixed_page_sizes` flags variety.
        "page_size": {"width": sizes[0][0], "height": sizes[0][1]} if sizes else None,
        "mixed_page_sizes": len(set(sizes)) > 1,
        "metadata": {
            "title": metadata.title if metadata else None,
            "author": metadata.author if metadata else None,
            "subject": metadata.subject if metadata else None,
            "keywords": metadata.keywords if metadata else None,
            "creator": metadata.creator if metadata else None,
            "producer": metadata.producer if metadata else None,
            "created": _date(metadata, "creation_date") if metadata else None,
            "modified": _date(metadata, "modification_date") if metadata else None,
        },
    }
