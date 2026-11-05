
from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import uuid4
import zipfile

from PIL import Image
from pypdf import PdfReader, PdfWriter, Transformation
from reportlab.lib.colors import Color
from reportlab.pdfgen import canvas


def _reader(path: Path) -> PdfReader:
    if not path.is_file():
        raise FileNotFoundError(f"PDF not found: {path.name}")

    reader = PdfReader(str(path), strict=False)

    if reader.is_encrypted:
        raise ValueError(f"Encrypted PDF is not supported: {path.name}")

    if not reader.pages:
        raise ValueError(f"PDF has no pages: {path.name}")

    return reader


def _save(writer: PdfWriter, output: Path) -> dict[str, Any]:
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_name(f".{uuid4().hex}.tmp")

    try:
        with temp.open("wb") as file:
            writer.write(file)
        temp.replace(output)
    finally:
        temp.unlink(missing_ok=True)

    return {
        "output_filename": output.name,
        "output_size_bytes": output.stat().st_size,
        "page_count": len(PdfReader(str(output)).pages),
    }


def _page_numbers(value: list[int], page_count: int) -> list[int]:
    if not value:
        raise ValueError("At least one page number is required.")

    if len(set(value)) != len(value):
        raise ValueError("Duplicate page numbers are not allowed.")

    if any(number < 1 or number > page_count for number in value):
        raise ValueError(f"Page numbers must be between 1 and {page_count}.")

    return value


def merge_pdfs(paths: list[Path], output: Path) -> dict[str, Any]:
    if len(paths) < 2:
        raise ValueError("At least two PDFs are required.")

    writer = PdfWriter()
    total = 0

    for path in paths:
        reader = _reader(path)
        writer.append(reader)
        total += len(reader.pages)

    result = _save(writer, output)
    result.update({"source_count": len(paths), "total_pages": total})
    return result


def extract_pages(path: Path, pages: list[int], output: Path) -> dict:
    reader = _reader(path)
    selected = _page_numbers(pages, len(reader.pages))
    writer = PdfWriter()

    for number in selected:
        writer.add_page(reader.pages[number - 1])

    return _save(writer, output)


def reorder_pages(path: Path, order: list[int], output: Path) -> dict:
    reader = _reader(path)
    selected = _page_numbers(order, len(reader.pages))

    if len(selected) != len(reader.pages):
        raise ValueError("Reorder must include every page exactly once.")

    writer = PdfWriter()
    for number in selected:
        writer.add_page(reader.pages[number - 1])

    return _save(writer, output)


def delete_pages(path: Path, pages: list[int], output: Path) -> dict:
    reader = _reader(path)
    selected = _page_numbers(pages, len(reader.pages))
    remaining = [i for i in range(1, len(reader.pages) + 1) if i not in selected]

    if not remaining:
        raise ValueError("Cannot delete every page from a PDF.")

    writer = PdfWriter()
    for number in remaining:
        writer.add_page(reader.pages[number - 1])

    return _save(writer, output)


def duplicate_pages(path: Path, pages: list[int], output: Path) -> dict:
    reader = _reader(path)
    selected = _page_numbers(pages, len(reader.pages))
    writer = PdfWriter()

    for page in reader.pages:
        writer.add_page(page)

    for number in selected:
        writer.add_page(reader.pages[number - 1])

    return _save(writer, output)


def rotate_pages(
    path: Path,
    pages: list[int],
    degrees: int,
    output: Path,
) -> dict:
    if degrees not in {90, 180, 270}:
        raise ValueError("Rotation must be 90, 180, or 270 degrees.")

    reader = _reader(path)
    selected = set(_page_numbers(pages, len(reader.pages)))
    writer = PdfWriter()

    for index, page in enumerate(reader.pages, start=1):
        if index in selected:
            page.rotate(degrees)
        writer.add_page(page)

    return _save(writer, output)


def split_pdf(
    path: Path,
    ranges: list[list[int]],
    output_zip: Path,
) -> dict:
    reader = _reader(path)

    if not ranges:
        raise ValueError("At least one page range is required.")

    output_zip.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = output_zip.parent / f".split-{uuid4().hex}"
    temp_dir.mkdir()

    try:
        created = []

        for index, page_range in enumerate(ranges, start=1):
            if len(page_range) != 2:
                raise ValueError("Each range must contain a start and end page.")

            start, end = page_range

            if start < 1 or end < start or end > len(reader.pages):
                raise ValueError("Invalid page range.")

            writer = PdfWriter()
            for number in range(start, end + 1):
                writer.add_page(reader.pages[number - 1])

            part = temp_dir / f"part_{index}.pdf"
            _save(writer, part)
            created.append(part)

        temp_zip = output_zip.with_name(f".{uuid4().hex}.tmp")

        with zipfile.ZipFile(temp_zip, "w", zipfile.ZIP_DEFLATED) as archive:
            for part in created:
                archive.write(part, arcname=part.name)

        temp_zip.replace(output_zip)
        temp_zip.unlink(missing_ok=True)

    finally:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)

    return {
        "output_filename": output_zip.name,
        "output_size_bytes": output_zip.stat().st_size,
        "parts": len(ranges),
    }


def _overlay_page(
    width: float,
    height: float,
    draw_callback,
) -> PdfReader:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=(width, height))
    draw_callback(pdf, width, height)
    pdf.save()
    buffer.seek(0)
    return PdfReader(buffer)


def _apply_overlay(path: Path, output: Path, draw_callback) -> dict:
    reader = _reader(path)
    writer = PdfWriter()

    for page in reader.pages:
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        overlay = _overlay_page(width, height, draw_callback)
        page.merge_page(overlay.pages[0])
        writer.add_page(page)

    return _save(writer, output)


def watermark_pdf(
    path: Path,
    text: str,
    output: Path,
    opacity: float = 0.25,
    font_size: int = 48,
) -> dict:
    if not text.strip():
        raise ValueError("Watermark text is required.")
    if not 0 <= opacity <= 1 or not 8 <= font_size <= 150:
        raise ValueError("Invalid watermark opacity or font size.")

    def draw(pdf, width, height):
        pdf.saveState()
        pdf.setFillAlpha(opacity)
        pdf.setFillColor(Color(0.4, 0.4, 0.4))
        pdf.setFont("Helvetica-Bold", font_size)
        pdf.translate(width / 2, height / 2)
        pdf.rotate(45)
        pdf.drawCentredString(0, 0, text[:150])
        pdf.restoreState()

    return _apply_overlay(path, output, draw)


def add_page_numbers(
    path: Path,
    output: Path,
    position: str = "bottom-center",
    font_size: int = 10,
) -> dict:
    allowed = {"bottom-center", "bottom-right", "top-right", "top-center"}
    if position not in allowed or not 6 <= font_size <= 36:
        raise ValueError("Invalid page number position or font size.")

    reader = _reader(path)
    writer = PdfWriter()

    for number, page in enumerate(reader.pages, start=1):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)

        def draw(pdf, w, h, n=number):
            pdf.setFont("Helvetica", font_size)
            y = 20 if position.startswith("bottom") else h - 20
            x = w / 2 if position.endswith("center") else w - 35
            pdf.drawCentredString(x, y, str(n))

        overlay = _overlay_page(width, height, draw)
        page.merge_page(overlay.pages[0])
        writer.add_page(page)

    return _save(writer, output)


def add_header_footer(
    path: Path,
    output: Path,
    header: str | None = None,
    footer: str | None = None,
) -> dict:
    if not header and not footer:
        raise ValueError("Provide a header or footer.")

    def draw(pdf, width, height):
        pdf.setFont("Helvetica", 9)
        if header:
            pdf.drawCentredString(width / 2, height - 20, header[:200])
        if footer:
            pdf.drawCentredString(width / 2, 15, footer[:200])

    return _apply_overlay(path, output, draw)


def add_background(
    path: Path,
    output: Path,
    color: tuple[float, float, float],
) -> dict:
    if len(color) != 3 or any(not 0 <= c <= 1 for c in color):
        raise ValueError("RGB values must be between 0 and 1.")

    def draw(pdf, width, height):
        pdf.setFillColor(Color(*color))
        pdf.rect(0, 0, width, height, fill=1, stroke=0)

    reader = _reader(path)
    writer = PdfWriter()

    for page in reader.pages:
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        overlay = _overlay_page(width, height, draw)
        overlay_page = overlay.pages[0]
        overlay_page.merge_page(page)
        writer.add_page(overlay_page)

    return _save(writer, output)


def crop_pages(
    path: Path,
    output: Path,
    left: float,
    bottom: float,
    right: float,
    top: float,
) -> dict:
    reader = _reader(path)
    writer = PdfWriter()

    for page in reader.pages:
        box = page.mediabox
        width = float(box.width)
        height = float(box.height)

        if min(left, bottom, right, top) < 0:
            raise ValueError("Crop margins cannot be negative.")
        if left + right >= width or bottom + top >= height:
            raise ValueError("Crop margins leave no visible page area.")

        page.cropbox.lower_left = (box.left + left, box.bottom + bottom)
        page.cropbox.upper_right = (box.right - right, box.top - top)
        writer.add_page(page)

    return _save(writer, output)


def add_text(
    path: Path,
    output: Path,
    text: str,
    x: float,
    y: float,
    font_size: int = 12,
) -> dict:
    if not text.strip() or len(text) > 1000:
        raise ValueError("Text must contain between 1 and 1000 characters.")
    if not 6 <= font_size <= 72:
        raise ValueError("Font size must be between 6 and 72.")

    def draw(pdf, width, height):
        if not 0 <= x <= width or not 0 <= y <= height:
            raise ValueError("Text position is outside the page.")
        pdf.setFont("Helvetica", font_size)
        pdf.drawString(x, y, text)

    return _apply_overlay(path, output, draw)


def add_image(
    path: Path,
    image_path: Path,
    output: Path,
    x: float,
    y: float,
    width: float,
    height: float,
) -> dict:
    if not image_path.is_file():
        raise FileNotFoundError("Image file was not found.")
    if width <= 0 or height <= 0:
        raise ValueError("Image dimensions must be positive.")

    try:
        with Image.open(image_path) as image:
            image.verify()
    except Exception as exc:
        raise ValueError("Invalid image file.") from exc

    def draw(pdf, page_width, page_height):
        if x < 0 or y < 0 or x + width > page_width or y + height > page_height:
            raise ValueError("Image placement exceeds page boundaries.")
        pdf.drawImage(
            str(image_path),
            x,
            y,
            width=width,
            height=height,
            preserveAspectRatio=True,
            mask="auto",
        )

    return _apply_overlay(path, output, draw)
