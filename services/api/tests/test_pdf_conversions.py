
from pathlib import Path
from zipfile import ZipFile

import pymupdf
import pytest

from docx import Document
from PIL import Image
from pptx import Presentation
from pypdf import PdfWriter

from app.engines.pdf.converter import (
    docx_to_pdf,
    images_to_pdf,
    pdf_to_docx,
    pdf_to_images,
    pdf_to_pptx,
    pdf_to_xlsx,
    pptx_to_pdf,
)


@pytest.fixture
def sample_pdf(tmp_path: Path) -> Path:
    path = tmp_path / "sample.pdf"

    document = pymupdf.open()

    for index in range(2):
        page = document.new_page(width=595, height=842)
        page.insert_text(
            (72, 100),
            f"Sample page {index + 1}",
            fontsize=16,
        )

    document.save(path)
    document.close()

    return path


@pytest.fixture
def sample_image(tmp_path: Path) -> Path:
    path = tmp_path / "sample.png"

    image = Image.new("RGB", (300, 200), "white")
    image.save(path)
    image.close()

    return path


@pytest.fixture
def sample_docx(tmp_path: Path) -> Path:
    path = tmp_path / "sample.docx"

    document = Document()
    document.add_heading("Conversion Test", level=1)
    document.add_paragraph("This is a sample document.")
    document.save(path)

    return path


@pytest.fixture
def sample_pptx(tmp_path: Path) -> Path:
    path = tmp_path / "sample.pptx"

    presentation = Presentation()
    slide = presentation.slides.add_slide(
        presentation.slide_layouts[6]
    )

    textbox = slide.shapes.add_textbox(
        100000,
        100000,
        5000000,
        1000000,
    )

    textbox.text_frame.text = "Sample presentation"
    presentation.save(path)

    return path


def test_pdf_to_images(sample_pdf, tmp_path):
    output = tmp_path / "images.zip"

    result = pdf_to_images(
        sample_pdf,
        output,
        image_format="png",
        dpi=72,
    )

    assert output.is_file()
    assert result["image_format"] == "png"

    with ZipFile(output) as archive:
        assert len(archive.namelist()) == 2


def test_images_to_pdf(sample_image, tmp_path):
    output = tmp_path / "images.pdf"

    result = images_to_pdf([sample_image], output)

    assert output.is_file()
    assert result["page_count"] == 1


def test_pdf_to_docx(sample_pdf, tmp_path):
    output = tmp_path / "converted.docx"

    result = pdf_to_docx(sample_pdf, output)

    assert output.is_file()
    assert result["conversion_mode"] == "editable_best_effort"


def test_docx_to_pdf(sample_docx, tmp_path):
    output = tmp_path / "converted.pdf"

    result = docx_to_pdf(sample_docx, output)

    assert output.is_file()
    assert result["output_size_bytes"] > 0


def test_pdf_to_xlsx(sample_pdf, tmp_path):
    output = tmp_path / "converted.xlsx"

    result = pdf_to_xlsx(sample_pdf, output)

    assert output.is_file()
    assert result["output_size_bytes"] > 0


def test_pdf_to_pptx(sample_pdf, tmp_path):
    output = tmp_path / "converted.pptx"

    result = pdf_to_pptx(sample_pdf, output, dpi=72)

    assert output.is_file()
    assert result["slide_count"] == 2


def test_pptx_to_pdf(sample_pptx, tmp_path):
    output = tmp_path / "converted.pdf"

    result = pptx_to_pdf(sample_pptx, output)

    assert output.is_file()
    assert result["page_count"] == 1


def test_invalid_image_format(sample_pdf, tmp_path):
    with pytest.raises(ValueError):
        pdf_to_images(
            sample_pdf,
            tmp_path / "images.zip",
            image_format="gif",
        )


def test_invalid_dpi(sample_pdf, tmp_path):
    with pytest.raises(ValueError):
        pdf_to_images(
            sample_pdf,
            tmp_path / "images.zip",
            dpi=500,
        )


def test_empty_image_list(tmp_path):
    with pytest.raises(ValueError):
        images_to_pdf([], tmp_path / "empty.pdf")
