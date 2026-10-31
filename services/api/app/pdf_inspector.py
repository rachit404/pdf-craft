
from pathlib import Path
from typing import Any

from pypdf import PdfReader


def inspect_pdf(file_path: Path) -> dict[str, Any]:
    """Return basic metadata for a readable PDF."""
    if not file_path.is_file():
        raise FileNotFoundError("PDF file was not found.")

    reader = PdfReader(str(file_path), strict=True)

    if reader.is_encrypted:
        raise ValueError("Encrypted PDFs are not supported yet.")

    metadata = reader.metadata

    return {
        "filename": file_path.name,
        "size_bytes": file_path.stat().st_size,
        "page_count": len(reader.pages),
        "metadata": {
            "title": metadata.title if metadata else None,
            "author": metadata.author if metadata else None,
            "subject": metadata.subject if metadata else None,
            "creator": metadata.creator if metadata else None,
            "producer": metadata.producer if metadata else None,
        },
    }
