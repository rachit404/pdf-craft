"""Power tools: blank pages, forms, document details and size targets (PyMuPDF)."""

from __future__ import annotations

import difflib
from pathlib import Path
from typing import Any

import pymupdf

from app.engines.pdf.compressor import compress_pdf
from app.engines.pdf.errors import ENCRYPTED_PDF_MESSAGE

# Pages are looked at as small greyscale pictures; a pixel is "ink" when darker than this.
_PROBE_DPI = 40
_INK_BELOW = 235
MAX_FORM_FIELDS = 500
SIZE_LEVELS = ("lossless", "balanced", "strong")


def _open(path: Path) -> pymupdf.Document:
    if not path.is_file():
        raise FileNotFoundError(f"PDF not found: {path.name}")

    try:
        document = pymupdf.open(path)
    except (pymupdf.FileDataError, pymupdf.EmptyFileError) as error:
        raise ValueError("The source file could not be processed as a valid PDF.") from error

    if document.needs_pass:
        document.close()
        raise ValueError(ENCRYPTED_PDF_MESSAGE)

    if document.page_count == 0:
        document.close()
        raise ValueError("PDF contains no pages.")

    return document


def _save(document: pymupdf.Document, output: Path) -> dict[str, Any]:
    output.parent.mkdir(parents=True, exist_ok=True)
    document.save(output, garbage=3, deflate=True)

    return {
        "output_filename": output.name,
        "output_size_bytes": output.stat().st_size,
        "page_count": document.page_count,
    }


def _ink_share(page: pymupdf.Page) -> float:
    """Share of a page, in percent, that is not close to white."""
    pixmap = page.get_pixmap(dpi=_PROBE_DPI, colorspace=pymupdf.csGRAY, alpha=False)
    samples = pixmap.samples
    dark = sum(1 for value in samples if value < _INK_BELOW)

    return dark * 100 / max(len(samples), 1)


def find_blank_pages(path: Path, ink_percent: float = 0.2) -> list[int]:
    """1-based numbers of pages with (almost) nothing on them."""
    with _open(path) as document:
        return [number for number, page in enumerate(document, start=1) if _ink_share(page) <= ink_percent]


def remove_blank_pages(path: Path, output: Path, ink_percent: float = 0.2) -> dict[str, Any]:
    with _open(path) as document:
        blank = {number for number, page in enumerate(document, start=1) if _ink_share(page) <= ink_percent}

        if len(blank) == document.page_count:
            raise ValueError("Every page looks blank, so nothing was removed.")

        document.select([index for index in range(document.page_count) if index + 1 not in blank])

        return {**_save(document, output), "pages_removed": len(blank)}


def ranges_between_blanks(path: Path, ink_percent: float = 0.2) -> list[list[int]]:
    """Page ranges separated by blank pages; the blank pages themselves are dropped."""
    with _open(path) as document:
        total = document.page_count

    blank = set(find_blank_pages(path, ink_percent))
    ranges: list[list[int]] = []
    start: int | None = None

    for number in range(1, total + 1):
        if number in blank:
            if start is not None:
                ranges.append([start, number - 1])
                start = None
        elif start is None:
            start = number

    if start is not None:
        ranges.append([start, total])

    if not ranges:
        raise ValueError("Every page looks blank.")

    return ranges


# ---------------------------------------------------------
# Forms
# ---------------------------------------------------------

def list_form_fields(path: Path) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []

    with _open(path) as document:
        for page_number, page in enumerate(document, start=1):
            for widget in page.widgets() or []:
                fields.append(
                    {
                        "name": widget.field_name,
                        "type": widget.field_type_string,
                        "value": widget.field_value if isinstance(widget.field_value, (str, bool)) else str(widget.field_value or ""),
                        "page": page_number,
                        "choices": [str(choice) for choice in (widget.choice_values or [])],
                    }
                )

                if len(fields) >= MAX_FORM_FIELDS:
                    return fields

    return fields


def fill_form(path: Path, output: Path, values: dict[str, str | bool], flatten: bool = False) -> dict[str, Any]:
    if not values and not flatten:
        raise ValueError("Give at least one field value, or ask to flatten.")

    with _open(path) as document:
        unknown = set(values)

        for page in document:
            for widget in page.widgets() or []:
                if widget.field_name in values:
                    unknown.discard(widget.field_name)
                    value = values[widget.field_name]

                    if widget.field_type_string in ("CheckBox", "RadioButton"):
                        widget.field_value = bool(value) if isinstance(value, bool) else str(value).lower() in ("true", "yes", "1", "on")
                    else:
                        widget.field_value = str(value)

                    widget.update()

        if unknown:
            raise ValueError(f"No such form field: {sorted(unknown)[0]}.")

        if flatten:
            document.bake(annots=False, widgets=True)

        return _save(document, output)


def flatten_forms(path: Path, output: Path) -> dict[str, Any]:
    """Turn form fields into ordinary page content, so they can no longer be edited."""
    with _open(path) as document:
        document.bake(annots=False, widgets=True)

        return _save(document, output)


# ---------------------------------------------------------
# Document details
# ---------------------------------------------------------

DETAIL_KEYS = ("title", "author", "subject", "keywords")


def edit_metadata(path: Path, output: Path, details: dict[str, str | None]) -> dict[str, Any]:
    """Set the given details. An empty text clears a detail; a missing one is left alone."""
    changes = {key: value for key, value in details.items() if key in DETAIL_KEYS and value is not None}

    if not changes:
        raise ValueError("Give at least one detail to change.")

    with _open(path) as document:
        document.set_metadata({**document.metadata, **changes})

        return _save(document, output)


# ---------------------------------------------------------
# Size target
# ---------------------------------------------------------

def compress_to_target(path: Path, output: Path, target_bytes: int) -> dict[str, Any]:
    """Try the gentlest level first and stop at the first that fits.

    When none fits, the smallest result is kept and `target_met` is False.
    """
    if target_bytes <= 0:
        raise ValueError("The target size must be more than zero.")

    best: tuple[int, Path, str] | None = None
    candidates: list[Path] = []

    try:
        for level in SIZE_LEVELS:
            candidate = output.with_name(f"{output.stem}.{level}.tmp")
            candidates.append(candidate)
            result = compress_pdf(path, candidate, level)
            size = result["output_size_bytes"]

            if best is None or size < best[0]:
                best = (size, candidate, level)

            if size <= target_bytes:
                break

        assert best is not None
        size, chosen, level = best
        chosen.replace(output)
    finally:
        for candidate in candidates:
            candidate.unlink(missing_ok=True)

    return {
        "output_filename": output.name,
        "output_size_bytes": size,
        "level": level,
        "target_met": size <= target_bytes,
        "original_size_bytes": path.stat().st_size,
    }


# ---------------------------------------------------------
# Greyscale
# ---------------------------------------------------------

def to_grayscale(path: Path, output: Path) -> dict[str, Any]:
    """Turn colours and images grey. Text stays text."""
    with _open(path) as document:
        for page in document:
            page.recolor(1)

        return _save(document, output)


# ---------------------------------------------------------
# Compare
# ---------------------------------------------------------

MAX_CHANGED_PAGES = 50
MAX_LINES = 30


def _lines(page: pymupdf.Page) -> list[str]:
    return [" ".join(line.split()) for line in page.get_text().splitlines() if line.strip()]


def compare_pdfs(first: Path, second: Path) -> dict[str, Any]:
    """Which pages differ in their text, and what was added or removed."""
    changes: list[dict[str, Any]] = []

    with _open(first) as a, _open(second) as b:
        for index in range(max(a.page_count, b.page_count)):
            before = _lines(a[index]) if index < a.page_count else []
            after = _lines(b[index]) if index < b.page_count else []

            if before == after:
                continue

            removed: list[str] = []
            added: list[str] = []

            for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, before, after, autojunk=False).get_opcodes():
                if tag in ("replace", "delete"):
                    removed.extend(before[i1:i2])

                if tag in ("replace", "insert"):
                    added.extend(after[j1:j2])

            changes.append(
                {
                    "page": index + 1,
                    "removed": removed[:MAX_LINES],
                    "added": added[:MAX_LINES],
                    "only_in": "first" if index >= b.page_count else "second" if index >= a.page_count else None,
                }
            )

            if len(changes) >= MAX_CHANGED_PAGES:
                break

        return {
            "pages_first": a.page_count,
            "pages_second": b.page_count,
            "identical": not changes,
            "changes": changes,
            "truncated": len(changes) >= MAX_CHANGED_PAGES,
        }
