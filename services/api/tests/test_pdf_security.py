
from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.main import app
from app.storage import UPLOAD_DIR, OUTPUT_DIR, ensure_storage_dirs


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def pdf_file():
    ensure_storage_dirs()
    path = UPLOAD_DIR / "security-test.pdf"

    document = pymupdf.open()
    page = document.new_page(width=300, height=300)
    page.insert_text((40, 60), "CONFIDENTIAL TEST DATA", fontsize=12)
    document.save(path)
    document.close()

    yield path
    path.unlink(missing_ok=True)


def test_protect_and_unlock(pdf_file):
    protected = OUTPUT_DIR / "security-protected-test.pdf"
    unlocked = OUTPUT_DIR / "security-unlocked-test.pdf"

    from app.engines.pdf.security import protect_pdf, unlock_pdf

    try:
        protect_pdf(
            pdf_file, protected,
            "test-password", "owner-password",
            True, False, False, False,
        )

        reader = PdfReader(str(protected))
        assert reader.is_encrypted
        assert reader.decrypt("test-password")

        unlock_pdf(protected, unlocked, "test-password")
        unlocked_reader = PdfReader(str(unlocked))
        assert not unlocked_reader.is_encrypted
        assert len(unlocked_reader.pages) == 1
    finally:
        protected.unlink(missing_ok=True)
        unlocked.unlink(missing_ok=True)


def test_unlock_rejects_wrong_password(pdf_file):
    from app.engines.pdf.security import protect_pdf, unlock_pdf

    protected = OUTPUT_DIR / "security-wrong-password-test.pdf"
    output = OUTPUT_DIR / "security-wrong-password-output.pdf"

    try:
        protect_pdf(
            pdf_file, protected,
            "correct-password", None,
            True, False, False, False,
        )

        with pytest.raises(ValueError, match="Incorrect"):
            unlock_pdf(protected, output, "wrong-password")
    finally:
        protected.unlink(missing_ok=True)
        output.unlink(missing_ok=True)


def test_redaction_removes_text(pdf_file):
    from app.engines.pdf.security import redact_pdf

    output = OUTPUT_DIR / "security-redacted-test.pdf"

    try:
        redact_pdf(
            pdf_file,
            output,
            [{"page": 1, "x0": 30, "y0": 35, "x1": 220, "y1": 75}],
        )

        document = pymupdf.open(output)
        text = document[0].get_text()
        document.close()

        assert "CONFIDENTIAL TEST DATA" not in text
    finally:
        output.unlink(missing_ok=True)


def test_sanitize_creates_valid_pdf(pdf_file):
    from app.engines.pdf.security import sanitize_pdf

    output = OUTPUT_DIR / "security-sanitized-test.pdf"

    try:
        sanitize_pdf(pdf_file, output)

        document = pymupdf.open(output)
        assert document.page_count == 1
        assert document.metadata.get("title") in (None, "")
        document.close()
    finally:
        output.unlink(missing_ok=True)


def test_security_routes_registered(client):
    paths = client.get("/openapi.json").json()["paths"]

    expected = {
        "/security/{filename}/protect",
        "/security/{filename}/unlock",
        "/security/{filename}/redact",
        "/security/{filename}/sanitize",
    }

    assert expected.issubset(paths.keys())


def test_security_endpoint_rejects_missing_pdf(client):
    response = client.post(
        "/security/missing.pdf/sanitize",
    )
    assert response.status_code == 404
