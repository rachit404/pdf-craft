
from __future__ import annotations

from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import pymupdf
import pytest

from docx import Document
from openpyxl import load_workbook
from PIL import Image
from pptx import Presentation
from fastapi.testclient import TestClient

from app.main import app
from app.storage import UPLOAD_DIR, OUTPUT_DIR, ensure_storage_dirs


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def artifacts():
    ensure_storage_dirs()
    paths: list[Path] = []

    def track(path: Path):
        paths.append(path)
        return path

    yield track

    for path in paths:
        path.unlink(missing_ok=True)


def make_pdf() -> bytes:
    document = pymupdf.open()

    for number in range(2):
        page = document.new_page(width=595, height=842)
        page.insert_text(
            (72, 100),
            f"Conversion test page {number + 1}",
            fontsize=16,
        )

    content = document.tobytes()
    document.close()
    return content


def make_png() -> bytes:
    buffer = BytesIO()
    image = Image.new("RGB", (300, 200), "white")
    image.save(buffer, format="PNG")
    image.close()
    return buffer.getvalue()


def make_docx() -> bytes:
    buffer = BytesIO()
    document = Document()
    document.add_heading("Conversion API Test", level=1)
    document.add_paragraph("This is a test document.")
    document.save(buffer)
    return buffer.getvalue()


def make_pptx() -> bytes:
    buffer = BytesIO()
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
    textbox.text_frame.text = "Conversion API Test"

    presentation.save(buffer)
    return buffer.getvalue()


def upload_pdf(client: TestClient, artifacts) -> str:
    response = client.post(
        "/uploads",
        files={
            "file": (
                "sample.pdf",
                make_pdf(),
                "application/pdf",
            )
        },
    )

    assert response.status_code == 201, response.text

    filename = response.json()["stored_filename"]
    artifacts(UPLOAD_DIR / filename)

    return filename


def upload_image(client: TestClient, artifacts) -> str:
    response = client.post(
        "/uploads/image",
        files={
            "file": (
                "sample.png",
                make_png(),
                "image/png",
            )
        },
    )

    assert response.status_code == 201, response.text

    filename = response.json()["stored_filename"]
    artifacts(UPLOAD_DIR / filename)

    return filename


def assert_download(client: TestClient, filename: str, content_type: str):
    response = client.get(f"/outputs/{filename}")

    assert response.status_code == 200, response.text
    assert content_type in response.headers["content-type"]
    assert len(response.content) > 0

    return response.content


def test_conversion_routes_are_registered(client):
    paths = client.get("/openapi.json").json()["paths"]

    expected = {
        "/conversions/pdf-to-images",
        "/conversions/images-to-pdf",
        "/conversions/{filename}/to-docx",
        "/conversions/{filename}/to-xlsx",
        "/conversions/{filename}/to-pptx",
        "/conversions/docx-to-pdf",
        "/conversions/pptx-to-pdf",
    }

    assert expected.issubset(paths.keys())


def test_api_pdf_to_images(client, artifacts):
    filename = upload_pdf(client, artifacts)

    response = client.post(
        "/conversions/pdf-to-images",
        params={"filename": filename},
        json={"image_format": "png", "dpi": 72},
    )

    assert response.status_code == 200, response.text

    output_filename = response.json()["output_filename"]
    artifacts(OUTPUT_DIR / output_filename)

    content = assert_download(
        client,
        output_filename,
        "application/zip",
    )

    with ZipFile(BytesIO(content)) as archive:
        names = archive.namelist()

    assert len(names) == 2
    assert all(name.endswith(".png") for name in names)


def test_api_images_to_pdf(client, artifacts):
    image_filename = upload_image(client, artifacts)

    response = client.post(
        "/conversions/images-to-pdf",
        json={"filenames": [image_filename]},
    )

    assert response.status_code == 200, response.text

    output_filename = response.json()["output_filename"]
    artifacts(OUTPUT_DIR / output_filename)

    content = assert_download(
        client,
        output_filename,
        "application/pdf",
    )

    document = pymupdf.open(stream=content, filetype="pdf")
    assert document.page_count == 1
    document.close()


def test_api_pdf_to_docx(client, artifacts):
    filename = upload_pdf(client, artifacts)

    response = client.post(
        f"/conversions/{filename}/to-docx"
    )

    assert response.status_code == 200, response.text

    output_filename = response.json()["output_filename"]
    artifacts(OUTPUT_DIR / output_filename)

    content = assert_download(
        client,
        output_filename,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    document = Document(BytesIO(content))
    assert document.paragraphs is not None


def test_api_pdf_to_xlsx(client, artifacts):
    filename = upload_pdf(client, artifacts)

    response = client.post(
        f"/conversions/{filename}/to-xlsx"
    )

    assert response.status_code == 200, response.text

    output_filename = response.json()["output_filename"]
    artifacts(OUTPUT_DIR / output_filename)

    content = assert_download(
        client,
        output_filename,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

    workbook = load_workbook(BytesIO(content))
    assert len(workbook.sheetnames) >= 1
    workbook.close()


def test_api_pdf_to_pptx(client, artifacts):
    filename = upload_pdf(client, artifacts)

    response = client.post(
        f"/conversions/{filename}/to-pptx",
        json={"dpi": 72},
    )

    assert response.status_code == 200, response.text

    output_filename = response.json()["output_filename"]
    artifacts(OUTPUT_DIR / output_filename)

    content = assert_download(
        client,
        output_filename,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )

    presentation = Presentation(BytesIO(content))
    assert len(presentation.slides) == 2


def test_api_docx_to_pdf(client, artifacts):
    response = client.post(
        "/conversions/docx-to-pdf",
        files={
            "file": (
                "sample.docx",
                make_docx(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert response.status_code == 200, response.text

    output_filename = response.json()["output_filename"]
    artifacts(OUTPUT_DIR / output_filename)

    content = assert_download(
        client,
        output_filename,
        "application/pdf",
    )

    document = pymupdf.open(stream=content, filetype="pdf")
    assert document.page_count >= 1
    document.close()


def test_api_pptx_to_pdf(client, artifacts):
    response = client.post(
        "/conversions/pptx-to-pdf",
        files={
            "file": (
                "sample.pptx",
                make_pptx(),
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            )
        },
    )

    assert response.status_code == 200, response.text

    output_filename = response.json()["output_filename"]
    artifacts(OUTPUT_DIR / output_filename)

    content = assert_download(
        client,
        output_filename,
        "application/pdf",
    )

    document = pymupdf.open(stream=content, filetype="pdf")
    assert document.page_count == 1
    document.close()


def test_api_pdf_to_images_rejects_missing_file(client):
    response = client.post(
        "/conversions/pdf-to-images",
        params={"filename": "missing.pdf"},
        json={"image_format": "png", "dpi": 72},
    )

    assert response.status_code == 404


def test_api_rejects_invalid_image_filename(client):
    response = client.post(
        "/conversions/images-to-pdf",
        json={"filenames": ["../outside.png"]},
    )

    assert response.status_code == 400
