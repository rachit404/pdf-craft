
from pathlib import Path
from uuid import uuid4

from app.engines.pdf import converter
from app.storage import OUTPUT_DIR, ensure_storage_dirs


def _output_path(extension: str) -> Path:
    ensure_storage_dirs()
    return OUTPUT_DIR / f"{uuid4().hex}{extension}"


def _execute(operation, *args, extension: str, **kwargs) -> dict:
    output = _output_path(extension)

    try:
        return operation(*args, output=output, **kwargs)
    except Exception:
        output.unlink(missing_ok=True)
        raise


def pdf_to_images(path: Path, image_format: str, dpi: int) -> dict:
    return _execute(
        converter.pdf_to_images,
        path,
        extension=".zip",
        image_format=image_format,
        dpi=dpi,
    )


def images_to_pdf(paths: list[Path]) -> dict:
    return _execute(
        converter.images_to_pdf,
        paths,
        extension=".pdf",
    )


def pdf_to_docx(path: Path) -> dict:
    return _execute(
        converter.pdf_to_docx,
        path,
        extension=".docx",
    )


def docx_to_pdf(path: Path) -> dict:
    return _execute(
        converter.docx_to_pdf,
        path,
        extension=".pdf",
    )


def pdf_to_xlsx(path: Path) -> dict:
    return _execute(
        converter.pdf_to_xlsx,
        path,
        extension=".xlsx",
    )


def pdf_to_pptx(path: Path, dpi: int) -> dict:
    return _execute(
        converter.pdf_to_pptx,
        path,
        extension=".pptx",
        dpi=dpi,
    )


def pptx_to_pdf(path: Path) -> dict:
    return _execute(
        converter.pptx_to_pdf,
        path,
        extension=".pdf",
    )
