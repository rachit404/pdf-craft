"""Conversion behaviour added in Part 2: Images to PDF, Office engine, validation."""

import os
import stat
import sys
import zipfile
from io import BytesIO
from pathlib import Path
from urllib.parse import unquote

import pymupdf
import pytest
from docx import Document
from PIL import Image
from pypdf import PdfWriter

from app.engines.pdf import converter, office


# ---------------------------------------------------------
# Images to PDF
# ---------------------------------------------------------

def make_image(path: Path, size=(400, 200), color=(255, 0, 0), mode="RGB", **save):
    Image.new(mode, size, color).save(path, **save)
    return path


def test_pages_follow_image_order_and_orientation(tmp_path):
    landscape = make_image(tmp_path / "a.png", (400, 200), (255, 0, 0))
    portrait = make_image(tmp_path / "b.png", (200, 400), (0, 0, 255))
    output = tmp_path / "out.pdf"

    result = converter.images_to_pdf([landscape, portrait], output)

    assert result["page_count"] == 2

    with pymupdf.open(output) as document:
        first, second = document[0], document[1]

        # Each page fills one A4 dimension and keeps the image's aspect ratio.
        assert (first.rect.width, first.rect.height) == pytest.approx((842, 421), abs=0.5)
        assert (second.rect.width, second.rect.height) == pytest.approx((421, 842), abs=0.5)
        assert first.get_pixmap().pixel(10, 10)[0] > 200  # red first
        assert second.get_pixmap().pixel(10, 10)[2] > 200  # blue second


def test_jpeg_is_embedded_without_reencoding(tmp_path):
    photo = make_image(tmp_path / "p.jpg", (800, 600), (10, 120, 30), quality=90)
    output = tmp_path / "out.pdf"

    converter.images_to_pdf([photo], output)

    with pymupdf.open(output) as document:
        xref = document[0].get_images()[0][0]
        embedded = document.extract_image(xref)

    assert embedded["ext"] == "jpeg"
    assert embedded["image"] == photo.read_bytes()


def test_exif_orientation_is_applied(tmp_path):
    photo = tmp_path / "rotated.jpg"
    image = Image.new("RGB", (400, 200), (200, 50, 50))
    exif = image.getexif()
    exif[0x0112] = 6  # stored sideways: displayed rotated 90 degrees
    image.save(photo, exif=exif)
    output = tmp_path / "out.pdf"

    converter.images_to_pdf([photo], output)

    with pymupdf.open(output) as document:
        assert document[0].rect.height > document[0].rect.width


def test_transparent_png_is_supported(tmp_path):
    logo = make_image(tmp_path / "t.png", (50, 50), (255, 0, 0, 0), mode="RGBA")
    output = tmp_path / "out.pdf"

    assert converter.images_to_pdf([logo], output)["page_count"] == 1


def test_invalid_image_leaves_no_output(tmp_path):
    fake = tmp_path / "fake.png"
    fake.write_bytes(b"not an image")
    output = tmp_path / "out.pdf"

    with pytest.raises(ValueError, match="Invalid image"):
        converter.images_to_pdf([fake], output)

    assert not output.exists()


# ---------------------------------------------------------
# Word / PowerPoint engine selection (LibreOffice stubbed)
# ---------------------------------------------------------

def write_docx(path: Path) -> Path:
    document = Document()
    document.add_paragraph("Hello from Word")
    document.save(path)
    return path


def install_fake_soffice(tmp_path: Path, monkeypatch, behaviour: str) -> None:
    """Create a stand-in `soffice` that mimics the real command line."""
    script = tmp_path / "fake_soffice.py"
    script.write_text(
        "import sys, time, pymupdf\n"
        "from pathlib import Path\n"
        "args = sys.argv[1:]\n"
        f"mode = {behaviour!r}\n"
        "if mode == 'hang':\n"
        "    time.sleep(60)\n"
        "if mode == 'fail':\n"
        "    sys.exit(1)\n"
        "outdir = Path(args[args.index('--outdir') + 1])\n"
        "outdir.mkdir(parents=True, exist_ok=True)\n"
        "doc = pymupdf.open()\n"
        "doc.new_page().insert_text((72, 72), 'rendered by stub')\n"
        "doc.new_page()\n"
        "doc.save(outdir / (Path(args[-1]).stem + '.pdf'))\n"
    )

    if os.name == "nt":
        launcher = tmp_path / "soffice.cmd"
        launcher.write_text(f'@"{sys.executable}" "{script}" %*\n')
    else:
        launcher = tmp_path / "soffice"
        launcher.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{script}" "$@"\n')
        launcher.chmod(launcher.stat().st_mode | stat.S_IXUSR)

    monkeypatch.setenv("PDF_CRAFT_SOFFICE", str(launcher))


def test_libreoffice_engine_is_used_when_available(tmp_path, monkeypatch):
    install_fake_soffice(tmp_path, monkeypatch, "ok")
    output = tmp_path / "out" / "result.pdf"

    result = converter.docx_to_pdf(write_docx(tmp_path / "in.docx"), output)

    assert result["conversion_mode"] == "libreoffice"
    assert result["page_count"] == 2
    assert "rendered by stub" in pymupdf.open(output)[0].get_text()
    # No scratch directories left behind.
    assert [p.name for p in output.parent.iterdir()] == ["result.pdf"]


def test_libreoffice_failure_is_reported_not_hidden(tmp_path, monkeypatch):
    install_fake_soffice(tmp_path, monkeypatch, "fail")
    output = tmp_path / "result.pdf"

    with pytest.raises(ValueError, match="could not be converted"):
        converter.docx_to_pdf(write_docx(tmp_path / "in.docx"), output)

    assert not output.exists()


def test_libreoffice_timeout_stops_the_process(tmp_path, monkeypatch):
    install_fake_soffice(tmp_path, monkeypatch, "hang")
    monkeypatch.setattr(office, "TIMEOUT_SECONDS", 1)
    output = tmp_path / "result.pdf"

    with pytest.raises(ValueError, match="timed out"):
        converter.docx_to_pdf(write_docx(tmp_path / "in.docx"), output)

    assert not output.exists()


def test_basic_engine_is_the_fallback(tmp_path, monkeypatch):
    monkeypatch.setattr(office, "find_soffice", lambda: None)
    output = tmp_path / "result.pdf"

    result = converter.docx_to_pdf(write_docx(tmp_path / "in.docx"), output)

    assert result["conversion_mode"] == "basic_text_only"
    assert result["page_count"] == 1
    assert "Hello from Word" in pymupdf.open(output)[0].get_text()


# ---------------------------------------------------------
# API
# ---------------------------------------------------------

@pytest.fixture
def storage(tmp_path, monkeypatch):
    import app.api.routers.conversions as conversions
    import app.api.routers.outputs as outputs
    import app.api.routers.uploads as uploads
    import app.services.conversion_service as conversion_service

    for module, name in [
        (conversions, "UPLOAD_DIR"),
        (uploads, "UPLOAD_DIR"),
    ]:
        monkeypatch.setattr(module, name, tmp_path / "uploads")

    for module in (conversion_service, outputs):
        monkeypatch.setattr(module, "OUTPUT_DIR", tmp_path / "outputs")

    (tmp_path / "uploads").mkdir()
    (tmp_path / "outputs").mkdir()
    return tmp_path


def pdf_bytes(pages=2) -> bytes:
    document = pymupdf.open()

    for _ in range(pages):
        document.new_page().insert_text((72, 72), "hello")

    return document.tobytes()


def post_office(client, name, content, route="docx-to-pdf"):
    return client.post(
        f"/conversions/{route}",
        files={"file": (name, content, "application/octet-stream")},
    )


def test_capabilities_report_the_engine(client, monkeypatch):
    import app.api.routers.conversions as conversions

    monkeypatch.setattr(conversions, "find_soffice", lambda: "/usr/bin/soffice")
    assert client.get("/conversions/capabilities").json() == {"office_engine": "libreoffice"}

    monkeypatch.setattr(conversions, "find_soffice", lambda: None)
    assert client.get("/conversions/capabilities").json() == {"office_engine": "basic"}


@pytest.mark.parametrize(
    ("route", "name"),
    [("docx-to-pdf", "a.docx"), ("pptx-to-pdf", "a.pptx")],
)
def test_office_upload_must_be_a_real_document(client, storage, route, name):
    # Right extension, wrong content.
    assert post_office(client, name, b"plain text", route).status_code == 415

    # A ZIP without the main document part.
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("hello.txt", "hi")
    assert post_office(client, name, buffer.getvalue(), route).status_code == 415

    # Uploads that failed validation are not left on disk.
    assert list((storage / "uploads").iterdir()) == []


def test_office_upload_rejects_huge_unpacked_size(client, storage, monkeypatch):
    import app.api.routers.conversions as conversions

    monkeypatch.setattr(conversions, "MAX_UNPACKED_BYTES", 10)
    docx = BytesIO()
    write_docx(docx)

    assert post_office(client, "a.docx", docx.getvalue()).status_code == 413


def test_docx_upload_converts_and_cleans_up(client, storage):
    docx = BytesIO()
    write_docx(docx)

    response = post_office(client, "a.docx", docx.getvalue())

    assert response.status_code == 200
    assert list((storage / "uploads").iterdir()) == []
    assert (storage / "outputs" / response.json()["output_filename"]).is_file()


def test_pdf_to_images_route_and_validation(client, storage):
    upload = client.post("/uploads", files={"file": ("a.pdf", pdf_bytes(), "application/pdf")})
    name = upload.json()["stored_filename"]

    ok = client.post(f"/conversions/{name}/to-images", json={"image_format": "jpeg", "dpi": 72})
    assert ok.status_code == 200
    assert ok.json()["page_count"] == 2

    with zipfile.ZipFile(storage / "outputs" / ok.json()["output_filename"]) as archive:
        assert all(n.endswith(".jpg") for n in archive.namelist())

    assert client.post(f"/conversions/{name}/to-images", json={"dpi": 10}).status_code == 422


def test_encrypted_pdf_gets_actionable_message(client, storage):
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.encrypt("secret")
    buffer = BytesIO()
    writer.write(buffer)

    upload = client.post("/uploads", files={"file": ("e.pdf", buffer.getvalue(), "application/pdf")})
    name = upload.json()["stored_filename"]

    for response in (
        client.get(f"/uploads/{name}/info"),
        client.post(f"/conversions/{name}/to-docx"),
    ):
        assert response.status_code == 422
        assert "Unlock" in response.json()["detail"]


@pytest.mark.parametrize(
    ("requested", "expected"),
    [
        ("My Report.docx", "My Report.pdf"),
        ("../../evil.exe", "evil.pdf"),
        ("a\\b\\c.txt", "c.pdf"),
        ('we"ird<>.pdf', "we_ird__.pdf"),
        ("...", None),
    ],
)
def test_download_name_is_sanitised(client, storage, requested, expected):
    (storage / "outputs" / "abc123.pdf").write_bytes(pdf_bytes())

    response = client.get("/outputs/abc123.pdf", params={"name": requested})

    assert response.status_code == 200
    disposition = unquote(response.headers["content-disposition"])
    assert (expected or "abc123.pdf") in disposition
