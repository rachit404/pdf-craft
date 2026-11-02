
from pathlib import Path

import pytest
from pypdf import PdfWriter
from pypdf.generic import (
    DecodedStreamObject,
    DictionaryObject,
    NameObject,
)

from app.engines.pdf.compressor import compress_pdf
from app.engines.pdf.inspector import inspect_pdf
from app.engines.pdf.text_extractor import extract_pdf_text


@pytest.fixture
def sample_pdf(tmp_path: Path) -> Path:
    """Create a small valid PDF for engine tests."""
    pdf_path = tmp_path / "sample.pdf"

    writer = PdfWriter()
    writer.add_blank_page(width=300, height=400)
    writer.add_metadata(
        {
            "/Title": "PDF Craft Test Document",
            "/Author": "PDF Craft Tests",
        }
    )

    with pdf_path.open("wb") as file:
        writer.write(file)

    return pdf_path


@pytest.fixture
def text_pdf(tmp_path: Path) -> Path:
    """Create a PDF containing actual selectable text."""
    pdf_path = tmp_path / "text_sample.pdf"

    writer = PdfWriter()
    page = writer.add_blank_page(width=300, height=400)

    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )

    font_reference = writer._add_object(font)

    resources = DictionaryObject(
        {
            NameObject("/Font"): DictionaryObject(
                {
                    NameObject("/F1"): font_reference,
                }
            )
        }
    )

    page[NameObject("/Resources")] = resources

    content = DecodedStreamObject()
    content.set_data(
        b"BT /F1 12 Tf 72 720 Td "
        b"(PDF Craft text extraction test) Tj ET"
    )

    page[NameObject("/Contents")] = writer._add_object(content)

    with pdf_path.open("wb") as file:
        writer.write(file)

    return pdf_path


def test_inspect_pdf_returns_document_metadata(sample_pdf):
    result = inspect_pdf(sample_pdf)

    assert result["filename"] == "sample.pdf"
    assert result["page_count"] == 1
    assert result["size_bytes"] > 0
    assert result["metadata"]["title"] == "PDF Craft Test Document"
    assert result["metadata"]["author"] == "PDF Craft Tests"


def test_extract_pdf_text_from_blank_document(sample_pdf):
    result = extract_pdf_text(sample_pdf)

    assert result["filename"] == "sample.pdf"
    assert result["page_count"] == 1
    assert len(result["pages"]) == 1
    assert result["pages"][0]["page_number"] == 1
    assert result["pages"][0]["text"] == ""
    assert result["total_characters"] == 0


def test_extract_pdf_text_from_text_document(text_pdf):
    result = extract_pdf_text(text_pdf)

    extracted_text = result["pages"][0]["text"]

    assert result["filename"] == "text_sample.pdf"
    assert result["page_count"] == 1
    assert "PDF Craft text extraction test" in extracted_text
    assert result["total_characters"] > 0


def test_compress_pdf_creates_valid_output(sample_pdf, tmp_path):
    output_path = tmp_path / "compressed.pdf"

    result = compress_pdf(sample_pdf, output_path)

    assert output_path.is_file()
    assert result["output_filename"] == "compressed.pdf"
    assert result["original_size_bytes"] > 0
    assert result["compressed_size_bytes"] > 0
    assert isinstance(result["reduction_percent"], float)

    inspected_output = inspect_pdf(output_path)
    assert inspected_output["page_count"] == 1


def test_compress_pdf_rejects_missing_source(tmp_path):
    missing_path = tmp_path / "missing.pdf"
    output_path = tmp_path / "output.pdf"

    with pytest.raises(FileNotFoundError):
        compress_pdf(missing_path, output_path)

    assert not output_path.exists()


def test_compress_pdf_rejects_same_input_and_output(sample_pdf):
    with pytest.raises(ValueError, match="must be different"):
        compress_pdf(sample_pdf, sample_pdf)
