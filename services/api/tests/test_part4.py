"""Part 4: duplicate, compress levels, document info, history and retention."""

import os
import time
from io import BytesIO
from pathlib import Path

import pymupdf
import pytest
from docx import Document
from PIL import Image
from pypdf import PdfWriter

from app.engines.pdf.compressor import compress_pdf
from app.engines.pdf.inspector import inspect_pdf
from app.engines.pdf.operations import duplicate_pages
from app.services import history, retention


def make_pdf(path: Path, pages=("A", "B", "C")) -> Path:
    with pymupdf.open() as document:
        for text in pages:
            document.new_page(width=300, height=400).insert_text((40, 80), text)

        document.set_metadata({"title": "Annual Report", "keywords": "finance, 2026"})
        document.save(path)

    return path


def make_photo_pdf(path: Path) -> Path:
    """A page holding a large, noisy photo (hard to compress losslessly)."""
    photo = Image.frombytes("RGB", (1800, 1800), os.urandom(1800 * 1800 * 3))
    buffer = BytesIO()
    photo.save(buffer, format="JPEG", quality=95)

    with pymupdf.open() as document:
        page = document.new_page(width=595, height=842)
        page.insert_image(pymupdf.Rect(0, 0, 595, 595), stream=buffer.getvalue())
        page.insert_text((40, 700), "Caption stays searchable")
        document.save(path)

    return path


@pytest.fixture
def pdf(tmp_path):
    return make_pdf(tmp_path / "in.pdf")


def upload(client, path: Path, name="contract.pdf") -> str:
    response = client.post(
        "/uploads", files={"file": (name, path.read_bytes(), "application/pdf")}
    )
    assert response.status_code == 201
    return response.json()["stored_filename"]


def job_for(client, output_filename: str) -> dict | None:
    jobs = client.get("/jobs", params={"limit": 100}).json()
    return next((job for job in jobs if job["output_filename"] == output_filename), None)


# ---------------------------------------------------------
# Duplicate
# ---------------------------------------------------------

def test_duplicate_places_each_copy_after_its_original(pdf, tmp_path):
    output = tmp_path / "out.pdf"
    duplicate_pages(pdf, [1, 3], output)

    with pymupdf.open(output) as document:
        assert [page.get_text().strip() for page in document] == ["A", "A", "B", "C", "C"]


# ---------------------------------------------------------
# Compress
# ---------------------------------------------------------

def test_lossless_compression_keeps_pixels_and_never_grows(pdf, tmp_path):
    output = tmp_path / "out.pdf"
    result = compress_pdf(pdf, output)

    assert result["level"] == "lossless"
    assert result["compressed_size_bytes"] <= result["original_size_bytes"]
    assert result["saved_bytes"] >= 0
    assert result["output_size_bytes"] == output.stat().st_size


def test_image_levels_shrink_photos_and_keep_text(tmp_path):
    source = make_photo_pdf(tmp_path / "photo.pdf")
    sizes = {}

    for level in ("lossless", "balanced", "strong"):
        output = tmp_path / f"{level}.pdf"
        sizes[level] = compress_pdf(source, output, level)["compressed_size_bytes"]

        with pymupdf.open(output) as document:
            assert document.page_count == 1
            assert "Caption stays searchable" in document[0].get_text()
            assert len(document[0].get_images()) == 1

    assert sizes["strong"] < sizes["balanced"] < sizes["lossless"]
    assert sizes["strong"] < 0.5 * source.stat().st_size


def test_compress_rejects_unknown_level_and_encrypted_files(pdf, tmp_path):
    with pytest.raises(ValueError, match="Unknown compression level"):
        compress_pdf(pdf, tmp_path / "x.pdf", "extreme")

    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.encrypt("secret")
    locked = tmp_path / "locked.pdf"
    with locked.open("wb") as file:
        writer.write(file)

    for level in ("lossless", "strong"):
        with pytest.raises(ValueError, match="Unlock"):
            compress_pdf(locked, tmp_path / "y.pdf", level)

        assert not (tmp_path / "y.pdf").exists()


def test_compress_endpoint_accepts_an_optional_level(client, pdf_storage, pdf):
    name = upload(client, pdf)

    default = client.post(f"/uploads/{name}/compress")
    assert default.status_code == 200 and default.json()["level"] == "lossless"

    strong = client.post(f"/uploads/{name}/compress", json={"level": "strong"})
    assert strong.status_code == 200 and strong.json()["level"] == "strong"

    assert client.post(f"/uploads/{name}/compress", json={"level": "max"}).status_code == 422


# ---------------------------------------------------------
# Document info and text
# ---------------------------------------------------------

def test_info_reports_document_details(tmp_path):
    source = tmp_path / "mixed.pdf"
    with pymupdf.open() as document:
        document.new_page(width=595, height=842)
        document.new_page(width=842, height=595)
        document.set_metadata({"title": "Annual Report", "keywords": "finance"})
        document.save(source)

    info = inspect_pdf(source)

    assert info["page_count"] == 2
    assert info["pdf_version"][0].isdigit()
    assert info["page_size"] == {"width": 595.0, "height": 842.0}
    assert info["mixed_page_sizes"] is True
    assert info["metadata"]["title"] == "Annual Report"
    assert info["metadata"]["keywords"] == "finance"
    assert info["metadata"]["created"] is None or "T" in info["metadata"]["created"]


def test_text_endpoint_returns_pages_and_explains_encryption(client, pdf_storage, pdf):
    name = upload(client, pdf)
    body = client.get(f"/uploads/{name}/text").json()

    assert [page["text"].strip() for page in body["pages"]] == ["A", "B", "C"]

    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.encrypt("secret")
    buffer = BytesIO()
    writer.write(buffer)
    locked = client.post(
        "/uploads", files={"file": ("l.pdf", buffer.getvalue(), "application/pdf")}
    ).json()["stored_filename"]

    response = client.get(f"/uploads/{locked}/text")
    assert response.status_code == 422 and "Unlock" in response.json()["detail"]


# ---------------------------------------------------------
# History
# ---------------------------------------------------------

def test_operations_are_recorded_with_the_original_name(client, pdf_storage, pdf):
    name = upload(client, pdf, "contract.pdf")
    output = client.post(
        f"/operations/{name}/rotate", json={"pages": [1], "degrees": 90}
    ).json()["output_filename"]

    job = job_for(client, output)

    assert job["operation"] == "rotate"
    assert job["status"] == "completed"
    assert job["original_filename"] == "contract.pdf"
    assert job["output_size_bytes"] == (pdf_storage[1] / output).stat().st_size


def test_merge_history_names_the_first_file_and_counts_the_rest(client, pdf_storage, pdf):
    first = upload(client, pdf, "one.pdf")
    second = upload(client, pdf, "two.pdf")
    output = client.post(
        "/operations/merge", json={"filenames": [first, second]}
    ).json()["output_filename"]

    assert job_for(client, output)["original_filename"] == "one.pdf + 1 more"


def test_compress_and_security_outputs_are_recorded(client, pdf_storage, pdf):
    name = upload(client, pdf, "plan.pdf")
    compressed = client.post(f"/uploads/{name}/compress").json()["output_filename"]
    sanitized = client.post(f"/security/{name}/sanitize").json()["output_filename"]

    assert job_for(client, compressed)["operation"] == "compress"
    assert job_for(client, sanitized)["operation"] == "sanitize"


def test_direct_office_uploads_keep_their_file_name(client, tmp_path, monkeypatch):
    import app.api.routers.conversions as conversions
    import app.services.conversion_service as conversion_service

    for module, attribute in ((conversions, "UPLOAD_DIR"), (conversion_service, "OUTPUT_DIR")):
        monkeypatch.setattr(module, attribute, tmp_path)

    buffer = BytesIO()
    document = Document()
    document.add_paragraph("Hello")
    document.save(buffer)

    output = client.post(
        "/conversions/docx-to-pdf",
        files={"file": ("letter.docx", buffer.getvalue(), "application/octet-stream")},
    ).json()["output_filename"]

    job = job_for(client, output)
    assert (job["operation"], job["original_filename"]) == ("docx-to-pdf", "letter.docx")


def test_failures_and_read_only_requests_are_not_recorded(client, pdf_storage, pdf):
    name = upload(client, pdf)
    before = len(client.get("/jobs", params={"limit": 100}).json())

    client.get(f"/uploads/{name}/info")
    client.get(f"/uploads/{name}/text")
    client.get(f"/uploads/{name}/pages/1/preview")
    assert client.post(f"/operations/{name}/rotate", json={"pages": [9], "degrees": 90}).status_code == 422

    assert len(client.get("/jobs", params={"limit": 100}).json()) == before


def test_deleting_a_history_entry_removes_its_file(client, pdf_storage, pdf):
    name = upload(client, pdf)
    output = client.post(f"/security/{name}/sanitize").json()["output_filename"]
    job = job_for(client, output)

    assert client.delete(f"/jobs/{job['public_id']}").status_code == 200
    assert not (pdf_storage[1] / output).exists()
    assert job_for(client, output) is None


# ---------------------------------------------------------
# Retention
# ---------------------------------------------------------

@pytest.fixture
def stored(tmp_path, monkeypatch):
    """Point the retention service at temporary storage folders."""
    from app import storage

    uploads, outputs = tmp_path / "uploads", tmp_path / "outputs"
    uploads.mkdir()
    outputs.mkdir()
    monkeypatch.setattr(storage, "UPLOAD_DIR", uploads)
    monkeypatch.setattr(storage, "OUTPUT_DIR", outputs)
    return uploads, outputs


def age(path: Path, hours: float) -> Path:
    moment = time.time() - hours * 3600
    os.utime(path, (moment, moment))
    return path


def test_sweep_deletes_only_expired_files_and_their_history(client, stored):
    uploads, outputs = stored
    old_upload = age(make_pdf(uploads / "old.pdf"), 30)
    new_upload = make_pdf(uploads / "new.pdf")
    old_output = age(make_pdf(outputs / "old-out.pdf"), 30)
    new_output = make_pdf(outputs / "new-out.pdf")
    scratch = outputs / ".convert-abandoned"
    scratch.mkdir()
    age(scratch, 30)

    history.remember_upload("old.pdf", "a.pdf")
    history.remember_upload("new.pdf", "b.pdf")
    history.record_output("rotate", "a.pdf", "old-out.pdf")
    history.record_output("rotate", "b.pdf", "new-out.pdf")

    assert retention.sweep(24 * 3600) == 3

    assert not old_upload.exists() and not old_output.exists() and not scratch.exists()
    assert new_upload.exists() and new_output.exists()
    assert job_for(client, "old-out.pdf") is None
    assert job_for(client, "new-out.pdf") is not None
    assert history.source_label(["old.pdf"]) is None
    assert history.source_label(["new.pdf"]) == "b.pdf"


def test_delete_all_removes_every_file_and_clears_history(client, stored):
    uploads, outputs = stored
    make_pdf(uploads / "u.pdf")
    make_pdf(outputs / "o.pdf")
    history.record_output("merge", "x.pdf", "o.pdf")

    response = client.delete("/jobs")

    assert response.status_code == 200 and response.json() == {"files_deleted": 2}
    assert list(uploads.iterdir()) == [] and list(outputs.iterdir()) == []
    assert job_for(client, "o.pdf") is None


def test_retention_setting_is_exposed(client):
    assert client.get("/jobs/retention").json() == {"retention_hours": 0.0}


def test_background_cleanup_is_disabled_when_retention_is_zero():
    import asyncio

    # Returns immediately instead of looping forever.
    asyncio.run(asyncio.wait_for(retention.run_forever(), timeout=1))
