
import shutil
from pathlib import Path
from typing import Any

import pikepdf
import pymupdf

from app.engines.pdf.errors import ENCRYPTED_PDF_MESSAGE


# Images above `dpi_threshold` are resampled to `dpi_target` at JPEG `quality`.
LOSSY_LEVELS = {
    "balanced": {"dpi_threshold": 160, "dpi_target": 150, "quality": 75},
    "strong": {"dpi_threshold": 110, "dpi_target": 96, "quality": 55},
}


def _compress_lossless(input_path: Path, output_path: Path) -> None:
    """Repack the file structure with qpdf. Page content is untouched."""
    try:
        with pikepdf.open(input_path) as pdf:
            pdf.save(
                output_path,
                compress_streams=True,
                recompress_flate=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
            )

    except pikepdf.PasswordError as exc:
        raise ValueError(ENCRYPTED_PDF_MESSAGE) from exc

    except pikepdf.PdfError as exc:
        raise ValueError(
            "The source file could not be processed as a valid PDF."
        ) from exc


def _compress_images(input_path: Path, output_path: Path, level: str) -> None:
    """Downsample and re-encode images, then repack. Text stays sharp."""
    try:
        with pymupdf.open(input_path) as document:
            if document.needs_pass:
                raise ValueError(ENCRYPTED_PDF_MESSAGE)

            document.rewrite_images(**LOSSY_LEVELS[level])
            document.save(output_path, garbage=4, deflate=True, use_objstms=1)

    except pymupdf.FileDataError as exc:
        raise ValueError(
            "The source file could not be processed as a valid PDF."
        ) from exc


def compress_pdf(
    input_path: Path,
    output_path: Path,
    level: str = "lossless",
) -> dict[str, Any]:
    """Shrink a PDF. `lossless` never changes how pages look; `balanced` and
    `strong` trade image quality for size."""
    if not input_path.is_file():
        raise FileNotFoundError("Source PDF was not found.")

    if input_path.resolve() == output_path.resolve():
        raise ValueError("Input and output paths must be different.")

    if level != "lossless" and level not in LOSSY_LEVELS:
        raise ValueError("Unknown compression level.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    original_size = input_path.stat().st_size

    try:
        if level == "lossless":
            _compress_lossless(input_path, output_path)
        else:
            _compress_images(input_path, output_path, level)

        # Never hand back a file larger than the one supplied.
        if output_path.stat().st_size >= original_size:
            shutil.copyfile(input_path, output_path)

    except Exception:
        output_path.unlink(missing_ok=True)
        raise

    compressed_size = output_path.stat().st_size
    saved_bytes = original_size - compressed_size

    return {
        "level": level,
        "original_size_bytes": original_size,
        "compressed_size_bytes": compressed_size,
        "output_size_bytes": compressed_size,
        "saved_bytes": saved_bytes,
        "reduction_percent": round(saved_bytes / original_size * 100, 2)
        if original_size
        else 0.0,
        "output_filename": output_path.name,
    }
