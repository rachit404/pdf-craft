"""Power tools: each wraps an engine function and names its result file."""

from pathlib import Path
from uuid import uuid4

from app import storage
from app.engines.pdf import power


def _run(operation, path: Path, *args, **kwargs) -> dict:
    storage.ensure_storage_dirs()
    output = storage.OUTPUT_DIR / f"{uuid4().hex}.pdf"

    try:
        return {"message": "PDF operation completed successfully.", **operation(path, output, *args, **kwargs)}
    except Exception:
        output.unlink(missing_ok=True)
        raise


def remove_blank_pages(path: Path, ink_percent: float) -> dict:
    return _run(power.remove_blank_pages, path, ink_percent)


def blank_page_ranges(path: Path, ink_percent: float) -> list[list[int]]:
    return power.ranges_between_blanks(path, ink_percent)


def flatten_forms(path: Path) -> dict:
    return _run(power.flatten_forms, path)


def fill_form(path: Path, values: dict, flatten: bool) -> dict:
    return _run(power.fill_form, path, values, flatten)


def form_fields(path: Path) -> list[dict]:
    return power.list_form_fields(path)


def edit_metadata(path: Path, details: dict) -> dict:
    return _run(power.edit_metadata, path, details)


def annotate(path: Path, marks: list[dict], terms: list[str]) -> dict:
    return _run(power.annotate, path, marks, terms)


def deskew(path: Path, max_angle: float) -> dict:
    return _run(power.deskew, path, max_angle)


def to_grayscale(path: Path) -> dict:
    return _run(power.to_grayscale, path)


def compare(first: Path, second: Path) -> dict:
    return power.compare_pdfs(first, second)


def stamp(path: Path, **options) -> dict:
    from app.engines.pdf import operations

    return _run(operations.add_stamp, path, **options)


def compress_to_target(path: Path, target_mb: float) -> dict:
    return _run(power.compress_to_target, path, int(target_mb * 1024 * 1024))
