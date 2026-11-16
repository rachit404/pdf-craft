"""Behavioral tests for the Edit tools (text, image, header/footer, background, crop)."""

from io import BytesIO
from pathlib import Path

import pymupdf
import pytest
from PIL import Image
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject

from app.engines.pdf.operations import (
    add_background,
    add_header_footer,
    add_image,
    add_text,
    crop_pages,
)


def make_pdf(path: Path, pages: int = 3, cropbox: tuple | None = None) -> Path:
    writer = PdfWriter()

    for _ in range(pages):
        page = writer.add_blank_page(width=300, height=400)

        if cropbox:
            page.cropbox = RectangleObject(cropbox)

    with path.open("wb") as file:
        writer.write(file)

    return path


@pytest.fixture
def pdf(tmp_path):
    return make_pdf(tmp_path / "in.pdf")


@pytest.fixture
def png(tmp_path):
    path = tmp_path / "logo.png"
    Image.new("RGB", (40, 20), (255, 0, 0)).save(path)
    return path


def page_texts(path: Path) -> list[str]:
    with pymupdf.open(path) as doc:
        return [page.get_text().strip() for page in doc]


# ---------------------------------------------------------
# Add text
# ---------------------------------------------------------

def test_add_text_only_on_selected_pages(pdf, tmp_path):
    out = tmp_path / "out.pdf"
    add_text(pdf, out, "Hello", 30, 40, pages=[2])

    assert page_texts(out) == ["", "Hello", ""]


def test_add_text_defaults_to_every_page(pdf, tmp_path):
    out = tmp_path / "out.pdf"
    add_text(pdf, out, "Hello", 30, 40)

    assert page_texts(out) == ["Hello"] * 3


def test_add_text_is_placed_at_requested_point(pdf, tmp_path):
    out = tmp_path / "out.pdf"
    add_text(pdf, out, "Hello", 30, 40, font_size=12)

    with pymupdf.open(out) as doc:
        x0, y0, _x1, y1 = doc[0].get_text("words")[0][:4]

    assert x0 == pytest.approx(30, abs=1)
    # Baseline is 40pt above the bottom edge of a 400pt page.
    assert 400 - 40 - 12 <= y1 <= 400 - 40 + 4


def test_add_text_supports_multiple_lines_and_color(pdf, tmp_path):
    out = tmp_path / "out.pdf"
    add_text(pdf, out, "First\nSecond", 30, 300, color="#ff0000", pages=[1])

    with pymupdf.open(out) as doc:
        page = doc[0]
        assert page.get_text().split() == ["First", "Second"]
        colors = {
            span["color"]
            for block in page.get_text("dict")["blocks"]
            for line in block["lines"]
            for span in line["spans"]
        }

    assert colors == {0xFF0000}


def test_add_text_respects_cropbox_origin(tmp_path):
    source = make_pdf(tmp_path / "cropped.pdf", pages=1, cropbox=(50, 50, 250, 350))
    out = tmp_path / "out.pdf"

    # (10, 10) is relative to the visible area, not the media box.
    add_text(source, out, "Hi", 10, 10, font_size=10)

    with pymupdf.open(out) as doc:
        page = doc[0]
        assert page.rect.width == pytest.approx(200)
        x0, _y0, _x1, y1 = page.get_text("words")[0][:4]

    assert x0 == pytest.approx(10, abs=1)
    assert y1 == pytest.approx(300 - 10, abs=4)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"text": "日本語"},
        {"text": "   "},
        {"text": "x", "color": "red"},
        {"text": "x", "color": "#12345"},
        {"text": "x", "font_size": 200},
        {"text": "x", "x": 999},
        {"text": "x", "y": -1},
        {"text": "x", "pages": [4]},
        {"text": "x", "pages": [1, 1]},
    ],
)
def test_add_text_rejects_invalid_input(pdf, tmp_path, kwargs):
    arguments = {"text": "x", "x": 10, "y": 10, **kwargs}

    with pytest.raises(ValueError):
        add_text(pdf, tmp_path / "out.pdf", **arguments)

    assert not (tmp_path / "out.pdf").exists()


# ---------------------------------------------------------
# Add image
# ---------------------------------------------------------

def test_add_image_only_on_selected_pages(pdf, png, tmp_path):
    out = tmp_path / "out.pdf"
    add_image(pdf, png, out, 20, 20, 80, 40, pages=[1, 3])

    with pymupdf.open(out) as doc:
        assert [len(page.get_images()) for page in doc] == [1, 0, 1]


def test_add_image_is_drawn_inside_requested_box(pdf, png, tmp_path):
    out = tmp_path / "out.pdf"
    add_image(pdf, png, out, 20, 300, 80, 40, pages=[1])

    with pymupdf.open(out) as doc:
        rect = doc[0].get_image_rects(doc[0].get_images()[0][0])[0]

    assert (rect.x0, rect.x1) == pytest.approx((20, 100), abs=0.5)
    assert (rect.y0, rect.y1) == pytest.approx((60, 100), abs=0.5)


@pytest.mark.parametrize(
    "box",
    [(-1, 0, 10, 10), (0, 0, 0, 10), (250, 0, 100, 10), (0, 390, 10, 20)],
)
def test_add_image_rejects_invalid_placement(pdf, png, tmp_path, box):
    with pytest.raises(ValueError):
        add_image(pdf, png, tmp_path / "out.pdf", *box)


def test_add_image_rejects_non_image_file(pdf, tmp_path):
    fake = tmp_path / "fake.png"
    fake.write_bytes(b"not an image")

    with pytest.raises(ValueError, match="Invalid image"):
        add_image(pdf, fake, tmp_path / "out.pdf", 0, 0, 10, 10)


# ---------------------------------------------------------
# Header / footer
# ---------------------------------------------------------

def test_header_and_footer_are_on_every_page(pdf, tmp_path):
    out = tmp_path / "out.pdf"
    add_header_footer(pdf, out, header="Top", footer="Bottom")

    assert all(
        text.split() == ["Top", "Bottom"] for text in page_texts(out)
    )


def test_header_footer_rejects_non_latin_text(pdf, tmp_path):
    with pytest.raises(ValueError):
        add_header_footer(pdf, tmp_path / "out.pdf", header="日本語")


# ---------------------------------------------------------
# Background
# ---------------------------------------------------------

def test_background_is_painted_beneath_existing_content(pdf, tmp_path):
    with_text = tmp_path / "text.pdf"
    add_text(pdf, with_text, "Keep me", 30, 200, pages=[1])

    out = tmp_path / "out.pdf"
    add_background(with_text, out, (1.0, 1.0, 0.8))

    with pymupdf.open(out) as doc:
        pixmap = doc[0].get_pixmap(alpha=False)
        assert doc[0].get_text().strip() == "Keep me"

    assert pixmap.pixel(2, 2) == (255, 255, 204)


# ---------------------------------------------------------
# Crop
# ---------------------------------------------------------

def test_crop_sets_visible_area(pdf, tmp_path):
    out = tmp_path / "out.pdf"
    crop_pages(pdf, out, left=10, bottom=20, right=30, top=40)

    box = PdfReader(str(out)).pages[0].cropbox
    assert (box.left, box.bottom, box.right, box.top) == (10, 20, 270, 360)


def test_repeated_crops_accumulate(pdf, tmp_path):
    first, second = tmp_path / "first.pdf", tmp_path / "second.pdf"
    crop_pages(pdf, first, 10, 10, 10, 10)
    crop_pages(first, second, 10, 10, 10, 10)

    box = PdfReader(str(second)).pages[0].cropbox
    assert (box.width, box.height) == (260, 360)


def test_crop_rejects_margins_that_remove_the_page(pdf, tmp_path):
    with pytest.raises(ValueError):
        crop_pages(pdf, tmp_path / "out.pdf", 150, 0, 150, 0)


# ---------------------------------------------------------
# API
# ---------------------------------------------------------

def upload_pdf(client, path: Path) -> str:
    response = client.post(
        "/uploads",
        files={"file": ("doc.pdf", path.read_bytes(), "application/pdf")},
    )
    assert response.status_code == 201
    return response.json()["stored_filename"]


def upload_image(client, path: Path) -> str:
    response = client.post(
        "/uploads/image",
        files={"file": ("logo.png", path.read_bytes(), "image/png")},
    )
    assert response.status_code == 201
    return response.json()["stored_filename"]


def test_preview_returns_jpeg_with_page_size(client, pdf_storage, pdf):
    name = upload_pdf(client, pdf)
    response = client.get(f"/uploads/{name}/pages/2/preview?width=450")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["x-page-width"] == "300.00"
    assert response.headers["x-page-height"] == "400.00"

    with Image.open(BytesIO(response.content)) as image:
        assert image.size == (450, 600)


@pytest.mark.parametrize("path", ["pages/0/preview", "pages/4/preview"])
def test_preview_rejects_unknown_page(client, pdf_storage, pdf, path):
    name = upload_pdf(client, pdf)
    assert client.get(f"/uploads/{name}/{path}").status_code == 422


def test_preview_validates_width_and_file(client, pdf_storage, pdf):
    name = upload_pdf(client, pdf)

    assert client.get(f"/uploads/{name}/pages/1/preview?width=10").status_code == 422
    assert client.get("/uploads/missing.pdf/pages/1/preview").status_code == 404


def test_add_text_endpoint_writes_downloadable_pdf(client, pdf_storage, pdf):
    name = upload_pdf(client, pdf)
    response = client.post(
        f"/operations/{name}/add-text",
        json={"text": "API", "x": 20, "y": 20, "color": "#00ff00", "pages": [3]},
    )

    assert response.status_code == 200
    output = pdf_storage[1] / response.json()["output_filename"]
    assert page_texts(output) == ["", "", "API"]


@pytest.mark.parametrize("body", [{"color": "green"}, {"pages": []}, {"x": 9999}])
def test_add_text_endpoint_rejects_bad_requests(client, pdf_storage, pdf, body):
    name = upload_pdf(client, pdf)
    payload = {"text": "x", "x": 10, "y": 10, **body}

    assert client.post(f"/operations/{name}/add-text", json=payload).status_code == 422


def test_add_image_endpoint(client, pdf_storage, pdf, png):
    name = upload_pdf(client, pdf)
    image = upload_image(client, png)
    response = client.post(
        f"/operations/{name}/add-image",
        json={"image_filename": image, "x": 10, "y": 10, "width": 40, "height": 20, "pages": [2]},
    )

    assert response.status_code == 200
    with pymupdf.open(pdf_storage[1] / response.json()["output_filename"]) as doc:
        assert [len(page.get_images()) for page in doc] == [0, 1, 0]


@pytest.mark.parametrize(
    ("image_filename", "status"),
    [("missing.png", 404), ("../logo.png", 400), ("logo.pdf", 400)],
)
def test_add_image_endpoint_rejects_unknown_images(
    client, pdf_storage, pdf, image_filename, status
):
    name = upload_pdf(client, pdf)
    response = client.post(
        f"/operations/{name}/add-image",
        json={"image_filename": image_filename, "x": 1, "y": 1, "width": 5, "height": 5},
    )

    assert response.status_code == status
