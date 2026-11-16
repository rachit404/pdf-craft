from pathlib import Path

import pytest
from fastapi.testclient import TestClient

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
    import app.services.security_service as security_service

    monkeypatch.setattr(uploads_router, "UPLOAD_DIR", upload_dir)
    monkeypatch.setattr(pdf_service, "OUTPUT_DIR", output_dir)
    monkeypatch.setattr(security_service, "OUTPUT_DIR", output_dir)
    monkeypatch.setattr(outputs_router, "OUTPUT_DIR", output_dir)

    return upload_dir, output_dir


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
