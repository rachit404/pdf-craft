
from contextlib import ExitStack
from pathlib import Path
from typing import Any
from uuid import uuid4

from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError


def merge_pdfs(
    input_paths: list[Path],
    output_path: Path,
) -> dict[str, Any]:
    """Merge multiple PDF files into a single PDF."""

    if len(input_paths) < 2:
        raise ValueError("At least two PDF files are required.")

    resolved_inputs = [path.resolve() for path in input_paths]
    resolved_output = output_path.resolve()

    if resolved_output in resolved_inputs:
        raise ValueError("Output path cannot be the same as an input PDF.")

    for input_path in input_paths:
        if not input_path.is_file():
            raise FileNotFoundError(
                f"Source PDF was not found: {input_path.name}"
            )

    output_path.parent.mkdir(parents=True, exist_ok=True)

    writer = PdfWriter()
    total_pages = 0

    temporary_path = output_path.with_name(
        f".{output_path.stem}.{uuid4().hex}.tmp"
    )

    try:
        # Keep all source files open until the merged PDF is written.
        with ExitStack() as stack:
            for input_path in input_paths:
                source_file = stack.enter_context(input_path.open("rb"))
                reader = PdfReader(source_file, strict=False)

                if reader.is_encrypted:
                    raise ValueError(
                        f"Password-protected PDF cannot be merged: "
                        f"{input_path.name}"
                    )

                page_count = len(reader.pages)

                if page_count == 0:
                    raise ValueError(
                        f"PDF contains no pages: {input_path.name}"
                    )

                writer.append_pages_from_reader(reader)
                total_pages += page_count

            writer.write(temporary_path)

        # Replace the destination only after a successful write.
        temporary_path.replace(output_path)

    except PdfReadError as exc:
        raise ValueError(
            "One or more source files could not be read as valid PDFs."
        ) from exc

    finally:
        temporary_path.unlink(missing_ok=True)

    return {
        "output_filename": output_path.name,
        "source_count": len(input_paths),
        "total_pages": total_pages,
        "output_size_bytes": output_path.stat().st_size,
    }
