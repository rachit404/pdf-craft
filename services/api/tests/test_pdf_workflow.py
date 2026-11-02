
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app.main import app


@pytest.fixture
def pdf_storage(tmp_path: Path, monkeypatch):
    """Redirect PDF uploads and outputs to isolated temporary storage."""
    upload_dir = tmp_path / "uploads"
    output_dir = tmp_path / "outputs"

    upload_dir.mkdir()
    output_dir.mkdir()

    import app.api.routers.uploads as uploads_router
    import app.api.routers.outputs as outputs_router
    import app.services.pdf_service as pdf_service

    monkeypatch.setattr(uploads_router, "UPLOAD_DIR", upload_dir)
    monkeypatch.setattr(pdf_service, "OUTPUT_DIR", output_dir)
    monkeypatch.setattr(outputs_router, "OUTPUT_DIR", output_dir)

    return upload_dir, output_dir


@pytest.fixture
def sample_pdf_bytes():
    """Generate a valid one-page PDF in memory."""
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=400)

    buffer = BytesIO()
    writer.write(buffer)

    return buffer.getvalue()


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_complete_pdf_workflow(
    client,
    pdf_storage,
    sample_pdf_bytes,
):
    # 1. Upload the PDF.
    upload_response = client.post(
        "/uploads",
        files={
            "file": (
                "integration.pdf",
                sample_pdf_bytes,
                "application/pdf",
            )
        },
    )

    assert upload_response.status_code == 201

    upload_data = upload_response.json()
    stored_filename = upload_data["stored_filename"]

    assert upload_data["original_filename"] == "integration.pdf"
    assert upload_data["size_bytes"] == len(sample_pdf_bytes)

    upload_dir, output_dir = pdf_storage

    uploaded_file = upload_dir / stored_filename
    assert uploaded_file.is_file()

    # 2. Inspect the uploaded PDF.
    info_response = client.get(
        f"/uploads/{stored_filename}/info"
    )

    assert info_response.status_code == 200
    assert info_response.json()["page_count"] == 1

    # 3. Extract selectable text.
    text_response = client.get(
        f"/uploads/{stored_filename}/text"
    )

    assert text_response.status_code == 200
    assert text_response.json()["page_count"] == 1
    assert text_response.json()["total_characters"] == 0

    # 4. Compress the uploaded PDF.
    compression_response = client.post(
        f"/uploads/{stored_filename}/compress"
    )

    assert compression_response.status_code == 200

    compression_data = compression_response.json()
    output_filename = compression_data["output_filename"]

    assert compression_data["compressed_size_bytes"] > 0

    compressed_file = output_dir / output_filename
    assert compressed_file.is_file()

    # 5. Download the compressed PDF.
    download_response = client.get(
        f"/outputs/{output_filename}"
    )

    assert download_response.status_code == 200
    assert download_response.headers["content-type"] == "application/pdf"
    assert download_response.content.startswith(b"%PDF-")
