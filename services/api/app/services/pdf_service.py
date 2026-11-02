
from pathlib import Path
from uuid import uuid4

from app.engines.pdf.compressor import compress_pdf
from app.engines.pdf.inspector import inspect_pdf
from app.engines.pdf.text_extractor import extract_pdf_text
from app.storage import OUTPUT_DIR, ensure_storage_dirs


def inspect_document(file_path: Path) -> dict:
    """Inspect a PDF document and return its metadata."""
    return inspect_pdf(file_path)


def extract_document_text(file_path: Path) -> dict:
    """Extract selectable text from a PDF document."""
    return extract_pdf_text(file_path)


def compress_document(file_path: Path) -> dict:
    """Compress a PDF and save the processed document."""
    ensure_storage_dirs()

    output_filename = f"{uuid4().hex}.pdf"
    output_path = OUTPUT_DIR / output_filename

    try:
        result = compress_pdf(file_path, output_path)

        return {
            "message": "PDF compression completed successfully.",
            "original_filename": file_path.name,
            **result,
        }

    except Exception:
        output_path.unlink(missing_ok=True)
        raise
