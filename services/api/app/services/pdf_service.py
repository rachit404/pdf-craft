
from pathlib import Path
from uuid import uuid4

from app.engines.pdf.compressor import compress_pdf
from app.engines.pdf.inspector import inspect_pdf
from app.engines.pdf.text_extractor import extract_pdf_text
from app.engines.pdf import operations
from app.storage import OUTPUT_DIR, ensure_storage_dirs


def _output_path() -> Path:
    ensure_storage_dirs()
    return OUTPUT_DIR / f"{uuid4().hex}.pdf"


def inspect_document(file_path: Path) -> dict:
    return inspect_pdf(file_path)


def extract_document_text(file_path: Path) -> dict:
    return extract_pdf_text(file_path)


def compress_document(file_path: Path) -> dict:
    output = _output_path()
    try:
        return {
            "message": "PDF compression completed successfully.",
            "original_filename": file_path.name,
            **compress_pdf(file_path, output),
        }
    except Exception:
        output.unlink(missing_ok=True)
        raise


def _run(operation, *args, extension=".pdf", **kwargs):
    output = _output_path().with_suffix(extension)
    try:
        result = operation(*args, output=output, **kwargs)
        return {
            "message": "PDF operation completed successfully.",
            **result,
        }
    except Exception:
        output.unlink(missing_ok=True)
        raise


def merge_documents(paths: list[Path]) -> dict:
    return _run(operations.merge_pdfs, paths)


def extract_document_pages(path: Path, pages: list[int]) -> dict:
    return _run(operations.extract_pages, path, pages)


def reorder_document_pages(path: Path, order: list[int]) -> dict:
    return _run(operations.reorder_pages, path, order)


def delete_document_pages(path: Path, pages: list[int]) -> dict:
    return _run(operations.delete_pages, path, pages)


def duplicate_document_pages(path: Path, pages: list[int]) -> dict:
    return _run(operations.duplicate_pages, path, pages)


def rotate_document_pages(path: Path, pages: list[int], degrees: int) -> dict:
    return _run(operations.rotate_pages, path, pages, degrees)


def split_document(path: Path, ranges: list[list[int]]) -> dict:
    ensure_storage_dirs()
    output = OUTPUT_DIR / f"{uuid4().hex}.zip"
    try:
        result = operations.split_pdf(path, ranges, output)
        return {"message": "PDF split completed.", **result}
    except Exception:
        output.unlink(missing_ok=True)
        raise


def watermark_document(path: Path, text: str, opacity: float, font_size: int) -> dict:
    return _run(operations.watermark_pdf, path, text, opacity=opacity, font_size=font_size)


def number_document_pages(path: Path, position: str, font_size: int) -> dict:
    return _run(operations.add_page_numbers, path, position=position, font_size=font_size)


def header_footer_document(path: Path, header: str | None, footer: str | None) -> dict:
    return _run(operations.add_header_footer, path, header=header, footer=footer)


def background_document(path: Path, red: float, green: float, blue: float) -> dict:
    return _run(operations.add_background, path, color=(red, green, blue))


def crop_document(path: Path, left: float, bottom: float, right: float, top: float) -> dict:
    return _run(operations.crop_pages, path, left=left, bottom=bottom, right=right, top=top)


def text_document(path: Path, text: str, x: float, y: float, font_size: int) -> dict:
    return _run(operations.add_text, path, text, x, y, font_size=font_size)


def image_document(path: Path, image_path: Path, x: float, y: float, width: float, height: float) -> dict:
    return _run(operations.add_image, path, image_path, x, y, width, height)
