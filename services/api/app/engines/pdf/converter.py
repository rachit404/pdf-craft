
from __future__ import annotations

import shutil
import tempfile
import zipfile

from pathlib import Path
from uuid import uuid4

import pymupdf
import pdfplumber

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font

from pptx import Presentation
from pptx.util import Inches as PptInches

from PIL import Image
from pypdf import PdfReader
import warnings

with warnings.catch_warnings():
    warnings.filterwarnings(
        "ignore",
        message=r"The 'fitz' API is deprecated.*",
        category=Warning,
    )
    from pdf2docx import Converter

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


# ---------------------------------------------------------
# COMMON HELPERS
# ---------------------------------------------------------

def _ensure_file(path: Path, extensions: set[str]) -> None:
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {path.name}")

    if path.suffix.lower() not in extensions:
        raise ValueError(
            f"Unsupported file extension: {path.suffix}"
        )


def _ensure_pdf(path: Path) -> None:
    _ensure_file(path, {".pdf"})

    reader = PdfReader(str(path), strict=False)

    if reader.is_encrypted:
        raise ValueError("Encrypted PDFs are not supported.")

    if not reader.pages:
        raise ValueError("PDF contains no pages.")


def _finish(output: Path) -> dict:
    if not output.is_file() or output.stat().st_size == 0:
        raise ValueError("Conversion produced an empty output.")

    return {
        "output_filename": output.name,
        "output_size_bytes": output.stat().st_size,
    }


def _temporary_directory(parent: Path) -> Path:
    parent.mkdir(parents=True, exist_ok=True)
    return Path(tempfile.mkdtemp(prefix=".convert-", dir=parent))


# ---------------------------------------------------------
# PDF -> PNG / JPEG
# ---------------------------------------------------------

def pdf_to_images(
    source: Path,
    output: Path,
    image_format: str = "png",
    dpi: int = 150,
) -> dict:
    _ensure_pdf(source)

    image_format = image_format.lower()

    if image_format not in {"png", "jpeg", "jpg"}:
        raise ValueError("Image format must be PNG or JPEG.")

    if not 50 <= dpi <= 300:
        raise ValueError("DPI must be between 50 and 300.")

    extension = "jpg" if image_format in {"jpg", "jpeg"} else "png"
    output.parent.mkdir(parents=True, exist_ok=True)

    temp_dir = _temporary_directory(output.parent)
    temp_zip = output.with_name(f".{uuid4().hex}.tmp")

    try:
        document = pymupdf.open(source)
        try:
            if document.page_count == 0:
                raise ValueError("PDF contains no pages.")

            for index, page in enumerate(document, start=1):
                pixmap = page.get_pixmap(
                    dpi=dpi,
                    alpha=False,
                    colorspace=pymupdf.csRGB,
                )

                image_path = temp_dir / f"page_{index:04d}.{extension}"

                if extension == "jpg":
                    pixmap.save(str(image_path), jpg_quality=90)
                else:
                    pixmap.save(str(image_path))

        finally:
            document.close()

        with zipfile.ZipFile(
            temp_zip,
            "w",
            compression=zipfile.ZIP_DEFLATED,
        ) as archive:
            for image_path in sorted(temp_dir.iterdir()):
                archive.write(image_path, arcname=image_path.name)

        temp_zip.replace(output)

    finally:
        temp_zip.unlink(missing_ok=True)
        shutil.rmtree(temp_dir, ignore_errors=True)

    result = _finish(output)
    with zipfile.ZipFile(output) as archive:
        page_count = len(archive.namelist())

    result.update({
        "image_format": extension,
        "page_count": page_count,
        "dpi": dpi,
    })
    return result


# ---------------------------------------------------------
# PNG / JPEG -> PDF
# ---------------------------------------------------------

def images_to_pdf(
    image_paths: list[Path],
    output: Path,
) -> dict:
    if not image_paths:
        raise ValueError("At least one image is required.")

    if len(image_paths) > 100:
        raise ValueError("Maximum 100 images are supported.")

    images = []

    try:
        for path in image_paths:
            _ensure_file(path, {".png", ".jpg", ".jpeg"})

            with Image.open(path) as image:
                image.verify()

            with Image.open(path) as image:
                if image.mode not in {"RGB", "L"}:
                    image = image.convert("RGB")
                elif image.mode == "L":
                    image = image.convert("RGB")

                images.append(image.copy())

        if not images:
            raise ValueError("No valid images were supplied.")

        first, *remaining = images

        output.parent.mkdir(parents=True, exist_ok=True)
        first.save(
            output,
            "PDF",
            save_all=True,
            append_images=remaining,
            resolution=150.0,
        )

    except Exception:
        output.unlink(missing_ok=True)
        raise

    finally:
        for image in images:
            image.close()

    result = _finish(output)
    result["page_count"] = len(image_paths)
    return result


# ---------------------------------------------------------
# PDF -> DOCX
# ---------------------------------------------------------

def pdf_to_docx(source: Path, output: Path) -> dict:
    _ensure_pdf(source)

    output.parent.mkdir(parents=True, exist_ok=True)
    converter = None

    try:
        converter = Converter(str(source))
        converter.convert(str(output), start=0, end=None)

    except Exception:
        output.unlink(missing_ok=True)
        raise

    finally:
        if converter is not None:
            converter.close()

    result = _finish(output)
    result["conversion_mode"] = "editable_best_effort"
    return result


# ---------------------------------------------------------
# DOCX -> PDF
# ---------------------------------------------------------

def docx_to_pdf(source: Path, output: Path) -> dict:
    _ensure_file(source, {".docx"})

    document = Document(str(source))
    output.parent.mkdir(parents=True, exist_ok=True)

    pdf = canvas.Canvas(str(output), pagesize=A4)
    page_width, page_height = A4

    margin = 48
    x = margin
    y = page_height - margin
    max_width = page_width - (2 * margin)

    def new_page():
        nonlocal y
        pdf.showPage()
        y = page_height - margin

    def ensure_space(required: float):
        nonlocal y
        if y - required < margin:
            new_page()

    try:
        for paragraph in document.paragraphs:
            text = paragraph.text.strip()

            if not text:
                y -= 8
                continue

            style_name = paragraph.style.name.lower()
            is_heading = "heading" in style_name or style_name == "title"

            font_size = 16 if is_heading else 10
            font_name = "Helvetica-Bold" if is_heading else "Helvetica"

            pdf.setFont(font_name, font_size)

            lines = []
            current = ""

            for word in text.split():
                candidate = f"{current} {word}".strip()

                if pdf.stringWidth(candidate, font_name, font_size) > max_width:
                    if current:
                        lines.append(current)
                    current = word
                else:
                    current = candidate

            if current:
                lines.append(current)

            for line in lines:
                ensure_space(font_size + 5)
                pdf.drawString(x, y, line)
                y -= font_size + 5

            y -= 6

        for table in document.tables:
            for row in table.rows:
                cells = [cell.text.replace("\n", " ") for cell in row.cells]
                line = " | ".join(cells)

                pdf.setFont("Helvetica", 9)
                ensure_space(16)
                pdf.drawString(x, y, line[:180])
                y -= 15

        pdf.save()

    except Exception:
        output.unlink(missing_ok=True)
        raise

    return _finish(output)


# ---------------------------------------------------------
# PDF -> XLSX
# ---------------------------------------------------------

def pdf_to_xlsx(source: Path, output: Path) -> dict:
    _ensure_pdf(source)

    workbook = Workbook()
    default_sheet = workbook.active
    workbook.remove(default_sheet)

    extracted_tables = 0

    with pdfplumber.open(source) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            tables = page.extract_tables() or []

            for table_number, table in enumerate(tables, start=1):
                if not table:
                    continue

                sheet = workbook.create_sheet(
                    title=f"P{page_number}_T{table_number}"[:31]
                )

                for row in table:
                    sheet.append([
                        cell if cell is not None else ""
                        for cell in row
                    ])

                for column in sheet.columns:
                    column_letter = column[0].column_letter
                    max_length = max(
                        (len(str(cell.value or "")) for cell in column),
                        default=10,
                    )
                    sheet.column_dimensions[column_letter].width = min(
                        max(max_length + 2, 12),
                        50,
                    )

                for row in sheet.iter_rows():
                    for cell in row:
                        cell.alignment = Alignment(
                            vertical="top",
                            wrap_text=True,
                        )

                extracted_tables += 1

    if extracted_tables == 0:
        sheet = workbook.create_sheet("Extracted Text")

        with pdfplumber.open(source) as pdf:
            for page_number, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                sheet.append([f"Page {page_number}"])
                for line in text.splitlines():
                    sheet.append([line])

    output.parent.mkdir(parents=True, exist_ok=True)
    workbook.save(output)

    result = _finish(output)
    result.update({
        "tables_extracted": extracted_tables,
        "conversion_mode": "table_extraction",
    })
    return result


# ---------------------------------------------------------
# PDF -> PPTX (VISUAL PRESERVATION)
# ---------------------------------------------------------

def pdf_to_pptx(source: Path, output: Path, dpi: int = 150) -> dict:
    _ensure_pdf(source)

    if not 50 <= dpi <= 300:
        raise ValueError("DPI must be between 50 and 300.")

    presentation = Presentation()
    document = pymupdf.open(source)

    temp_dir = _temporary_directory(output.parent)

    try:
        if document.page_count == 0:
            raise ValueError("PDF contains no pages.")

        first_page = document[0]
        page_width = float(first_page.rect.width)
        page_height = float(first_page.rect.height)

        presentation.slide_width = int(page_width * 914400 / 72)
        presentation.slide_height = int(page_height * 914400 / 72)

        blank_layout = presentation.slide_layouts[6]

        for index, page in enumerate(document, start=1):
            pixmap = page.get_pixmap(
                dpi=dpi,
                alpha=False,
                colorspace=pymupdf.csRGB,
            )

            image_path = temp_dir / f"page_{index:04d}.png"
            pixmap.save(str(image_path))

            slide = presentation.slides.add_slide(blank_layout)
            slide.shapes.add_picture(
                str(image_path),
                0,
                0,
                width=presentation.slide_width,
                height=presentation.slide_height,
            )

        output.parent.mkdir(parents=True, exist_ok=True)
        presentation.save(output)

    except Exception:
        output.unlink(missing_ok=True)
        raise

    finally:
        document.close()
        shutil.rmtree(temp_dir, ignore_errors=True)

    result = _finish(output)
    result.update({
        "slide_count": len(presentation.slides),
        "conversion_mode": "visual_preservation",
    })
    return result


# ---------------------------------------------------------
# PPTX -> PDF (TEXT / SHAPE RECONSTRUCTION)
# ---------------------------------------------------------

def pptx_to_pdf(source: Path, output: Path) -> dict:
    _ensure_file(source, {".pptx"})

    presentation = Presentation(str(source))

    output.parent.mkdir(parents=True, exist_ok=True)

    page_width, page_height = landscape(A4)
    pdf = canvas.Canvas(
        str(output),
        pagesize=(page_width, page_height),
    )

    scale_x = page_width / presentation.slide_width
    scale_y = page_height / presentation.slide_height

    try:
        for slide in presentation.slides:
            for shape in slide.shapes:
                x = shape.left * scale_x
                y = page_height - (shape.top + shape.height) * scale_y
                width = shape.width * scale_x
                height = shape.height * scale_y

                if shape.has_text_frame:
                    text_frame = shape.text_frame
                    cursor_y = page_height - shape.top * scale_y - 20

                    for paragraph in text_frame.paragraphs:
                        text = paragraph.text.strip()

                        if not text:
                            continue

                        font_size = 12
                        for run in paragraph.runs:
                            if run.font.size:
                                font_size = run.font.size.pt
                                break

                        pdf.setFont(
                            "Helvetica",
                            min(max(font_size, 6), 36),
                        )

                        pdf.drawString(
                            max(x, 0),
                            max(cursor_y, 10),
                            text[:200],
                        )

                        cursor_y -= font_size + 5

                elif shape.has_table:
                    table = shape.table
                    row_y = y + height

                    for row in table.rows:
                        cell_text = " | ".join(
                            cell.text.replace("\n", " ")
                            for cell in row.cells
                        )

                        pdf.setFont("Helvetica", 8)
                        pdf.drawString(
                            max(x, 0),
                            max(row_y - 12, 10),
                            cell_text[:180],
                        )

                        row_y -= 14

            pdf.showPage()

        pdf.save()

    except Exception:
        output.unlink(missing_ok=True)
        raise

    result = _finish(output)
    result.update({
        "page_count": len(presentation.slides),
        "conversion_mode": "text_and_table_reconstruction",
    })
    return result
