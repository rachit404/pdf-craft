
from pathlib import Path
from typing import Any

import pikepdf


def compress_pdf(
    input_path: Path,
    output_path: Path,
) -> dict[str, Any]:
    """Apply lossless structural PDF compression using qpdf."""
    if not input_path.is_file():
        raise FileNotFoundError("Source PDF was not found.")

    if input_path.resolve() == output_path.resolve():
        raise ValueError("Input and output paths must be different.")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    original_size = input_path.stat().st_size

    try:
        with pikepdf.open(input_path) as pdf:
            pdf.save(
                output_path,
                compress_streams=True,
                recompress_flate=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
            )

    except pikepdf.PasswordError as exc:
        output_path.unlink(missing_ok=True)
        raise ValueError(
            "Password-protected PDFs cannot be compressed yet."
        ) from exc

    except pikepdf.PdfError as exc:
        output_path.unlink(missing_ok=True)
        raise ValueError(
            "The source file could not be processed as a valid PDF."
        ) from exc

    compressed_size = output_path.stat().st_size
    saved_bytes = original_size - compressed_size

    reduction_percent = (
        (saved_bytes / original_size) * 100
        if original_size > 0
        else 0.0
    )

    return {
        "original_size_bytes": original_size,
        "compressed_size_bytes": compressed_size,
        "saved_bytes": saved_bytes,
        "reduction_percent": round(reduction_percent, 2),
        "output_filename": output_path.name,
    }
