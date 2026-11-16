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


# ---------------------------------------------------------
# Annotations
# ---------------------------------------------------------

MAX_MARKS = 300
MAX_TERMS = 50
MARK_KINDS = ("highlight", "underline", "note", "box")
DEFAULT_COLOURS = {"highlight": "#FFE14D", "underline": "#D32F2F", "note": "#F9A825", "box": "#D32F2F"}


def _rgb(value: str | None, fallback: str) -> tuple[float, float, float]:
    text = value if value and len(value) == 7 and value.startswith("#") else fallback

    try:
        return tuple(int(text[i : i + 2], 16) / 255 for i in (1, 3, 5))  # type: ignore[return-value]
    except ValueError as error:
        raise ValueError("Colours must use the #RRGGBB format.") from error


def annotate(path: Path, output: Path, marks: list[dict[str, Any]], terms: list[str]) -> dict[str, Any]:
    """Add highlights, underlines, notes and boxes as real PDF annotations.

    Marks use points from the top-left of the unrotated page, like redaction areas.
    `terms` are highlighted wherever they appear.
    """
    terms = [term.strip() for term in terms if term.strip()]

    if not marks and not terms:
        raise ValueError("Mark an area or give a word to highlight.")

    if len(marks) > MAX_MARKS or len(terms) > MAX_TERMS:
        raise ValueError(f"At most {MAX_MARKS} marks and {MAX_TERMS} words at a time.")

    added = 0

    with _open(path) as document:
        for mark in marks:
            kind = mark.get("kind", "highlight")
            number = int(mark.get("page", 0))

            if kind not in MARK_KINDS:
                raise ValueError(f"Unknown mark type: {kind}.")

            if not 1 <= number <= document.page_count:
                raise ValueError(f"Page {number} does not exist.")

            page = document[number - 1]
            rect = pymupdf.Rect(mark["x0"], mark["y0"], mark["x1"], mark["y1"]).normalize()
            colour = _rgb(mark.get("color"), DEFAULT_COLOURS[kind])

            if kind == "note":
                annotation = page.add_text_annot(rect.tl, str(mark.get("text") or "")[:1000], icon="Note")
            elif rect.is_empty or rect.is_infinite:
                raise ValueError("A marked area needs some size.")
            elif kind == "highlight":
                annotation = page.add_highlight_annot(rect)
            elif kind == "underline":
                annotation = page.add_underline_annot(rect)
            else:
                annotation = page.add_rect_annot(rect)
                annotation.set_border(width=1.5)

            annotation.set_colors(stroke=colour)
            annotation.update()
            added += 1

        for term in terms:
            for page in document:
                for quad in page.search_for(term, quads=True):
                    page.add_highlight_annot(quad).update()
                    added += 1

        if added == 0:
            raise ValueError("None of those words were found.")

        return {**_save(document, output), "annotations_added": added}


# ---------------------------------------------------------
# Straighten scans
# ---------------------------------------------------------

_SKEW_STEP = 0.25
_SKEW_MIN = 0.3


def estimate_skew(gray, max_angle: float = 10.0) -> float:
    """Degrees to rotate a scanned page counter-clockwise to make its text lines level.

    Uses the sharpness of the row profile: level text lines give tall, narrow peaks.
    """
    import cv2
    import numpy as np

    scale = 700 / max(gray.shape[1], 1)
    small = cv2.resize(gray, None, fx=min(scale, 1.0), fy=min(scale, 1.0), interpolation=cv2.INTER_AREA)
    _, ink = cv2.threshold(small, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    if ink.mean() < 0.4:  # next to nothing on the page
        return 0.0

    height, width = ink.shape
    centre = (width / 2, height / 2)

    def sharpness(angle: float) -> float:
        matrix = cv2.getRotationMatrix2D(centre, angle, 1.0)
        turned = cv2.warpAffine(ink, matrix, (width, height), flags=cv2.INTER_LINEAR, borderValue=0)
        profile = turned.sum(axis=1, dtype=np.float64)

        return float(np.sum(np.diff(profile) ** 2))

    angles = np.arange(-max_angle, max_angle + _SKEW_STEP, _SKEW_STEP)
    best = max(angles, key=sharpness)
    finer = np.arange(best - _SKEW_STEP, best + _SKEW_STEP + 0.05, 0.05)

    return round(float(max(finer, key=sharpness)), 2)


def deskew(path: Path, output: Path, max_angle: float = 10.0) -> dict[str, Any]:
    """Straighten tilted scanned pages. Pages with real text are left as they are."""
    try:
        import cv2
        import numpy as np
    except ImportError as error:  # pragma: no cover - installed with the app
        raise ValueError("Straightening needs OpenCV, which is not installed.") from error

    straightened = 0

    with _open(path) as source, pymupdf.open() as result:
        for index, page in enumerate(source):
            if page.get_text().strip() or not page.get_images():
                result.insert_pdf(source, from_page=index, to_page=index)
                continue

            pixmap = page.get_pixmap(dpi=150, colorspace=pymupdf.csGRAY, alpha=False)
            gray = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width)
            angle = estimate_skew(gray, max_angle)

            if abs(angle) < _SKEW_MIN:
                result.insert_pdf(source, from_page=index, to_page=index)
                continue

            matrix = cv2.getRotationMatrix2D((pixmap.width / 2, pixmap.height / 2), angle, 1.0)
            turned = cv2.warpAffine(gray, matrix, (pixmap.width, pixmap.height), flags=cv2.INTER_CUBIC, borderValue=255)
            ok, encoded = cv2.imencode(".png", turned)

            if not ok:
                raise ValueError("Could not rebuild a straightened page.")

            fresh = result.new_page(width=page.rect.width, height=page.rect.height)
            fresh.insert_image(fresh.rect, stream=encoded.tobytes())
            straightened += 1

        return {**_save(result, output), "pages_straightened": straightened}
