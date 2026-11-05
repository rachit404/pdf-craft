
from pathlib import Path

import pytest
from pypdf import PdfReader, PdfWriter

from app.engines.pdf.operations import (
    add_background,
    add_header_footer,
    add_page_numbers,
    add_text,
    crop_pages,
    delete_pages,
    duplicate_pages,
    extract_pages,
    merge_pdfs,
    reorder_pages,
    rotate_pages,
    split_pdf,
    watermark_pdf,
)


@pytest.fixture
def sample_pdfs(tmp_path: Path):
    paths = []

    for index, page_count in enumerate((2, 3), start=1):
        path = tmp_path / f"sample_{index}.pdf"
        writer = PdfWriter()

        for _ in range(page_count):
            writer.add_blank_page(width=300, height=400)

        with path.open("wb") as file:
            writer.write(file)

        paths.append(path)

    return paths


def count_pages(path: Path) -> int:
    return len(PdfReader(str(path)).pages)


def test_merge(sample_pdfs, tmp_path):
    output = tmp_path / "merged.pdf"
    result = merge_pdfs(sample_pdfs, output)
    assert result["total_pages"] == 5
    assert count_pages(output) == 5


def test_extract_pages(sample_pdfs, tmp_path):
    output = tmp_path / "extracted.pdf"
    extract_pages(sample_pdfs[0], [2], output)
    assert count_pages(output) == 1


def test_reorder_pages(sample_pdfs, tmp_path):
    output = tmp_path / "reordered.pdf"
    reorder_pages(sample_pdfs[0], [2, 1], output)
    assert count_pages(output) == 2


def test_reorder_requires_every_page(sample_pdfs, tmp_path):
    with pytest.raises(ValueError):
        reorder_pages(sample_pdfs[0], [1], tmp_path / "out.pdf")


def test_delete_pages(sample_pdfs, tmp_path):
    output = tmp_path / "deleted.pdf"
    delete_pages(sample_pdfs[0], [1], output)
    assert count_pages(output) == 1


def test_cannot_delete_every_page(sample_pdfs, tmp_path):
    with pytest.raises(ValueError):
        delete_pages(sample_pdfs[0], [1, 2], tmp_path / "out.pdf")


def test_duplicate_pages(sample_pdfs, tmp_path):
    output = tmp_path / "duplicated.pdf"
    duplicate_pages(sample_pdfs[0], [1], output)
    assert count_pages(output) == 3


def test_rotate_pages(sample_pdfs, tmp_path):
    output = tmp_path / "rotated.pdf"
    rotate_pages(sample_pdfs[0], [1], 90, output)
    reader = PdfReader(str(output))
    assert reader.pages[0].rotation == 90


def test_invalid_rotation(sample_pdfs, tmp_path):
    with pytest.raises(ValueError):
        rotate_pages(sample_pdfs[0], [1], 45, tmp_path / "out.pdf")


def test_split_pdf(sample_pdfs, tmp_path):
    output = tmp_path / "split.zip"
    result = split_pdf(sample_pdfs[0], [[1, 1], [2, 2]], output)
    assert result["parts"] == 2
    assert output.is_file()


def test_watermark(sample_pdfs, tmp_path):
    output = tmp_path / "watermarked.pdf"
    watermark_pdf(sample_pdfs[0], "CONFIDENTIAL", output)
    assert count_pages(output) == 2


def test_page_numbers(sample_pdfs, tmp_path):
    output = tmp_path / "numbered.pdf"
    add_page_numbers(sample_pdfs[0], output)
    assert count_pages(output) == 2


def test_header_footer(sample_pdfs, tmp_path):
    output = tmp_path / "header_footer.pdf"
    add_header_footer(
        sample_pdfs[0],
        output,
        header="Header",
        footer="Footer",
    )
    assert count_pages(output) == 2


def test_background(sample_pdfs, tmp_path):
    output = tmp_path / "background.pdf"
    add_background(sample_pdfs[0], output, (1.0, 1.0, 0.8))
    assert count_pages(output) == 2


def test_crop(sample_pdfs, tmp_path):
    output = tmp_path / "cropped.pdf"
    crop_pages(sample_pdfs[0], output, 10, 10, 10, 10)
    assert count_pages(output) == 2


def test_add_text(sample_pdfs, tmp_path):
    output = tmp_path / "text.pdf"
    add_text(sample_pdfs[0], output, "Added text", 30, 40)
    assert count_pages(output) == 2
