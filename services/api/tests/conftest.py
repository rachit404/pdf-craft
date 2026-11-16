import os
import tempfile
from pathlib import Path

# Tests get their own database and no background cleanup. This must run
# before the application is imported, because the engine is created then.
os.environ["PDF_CRAFT_DATABASE_URL"] = (
    "sqlite:///" + Path(tempfile.mkdtemp(prefix="pdf-craft-test-"), "test.db").as_posix()
)
os.environ["PDF_CRAFT_RETENTION_HOURS"] = "0"

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
    import app.services.conversion_service as conversion_service
    from app import storage
    import app.api.routers.outputs as outputs_router
    import app.services.pdf_service as pdf_service
    import app.services.security_service as security_service

    monkeypatch.setattr(uploads_router, "UPLOAD_DIR", upload_dir)
    monkeypatch.setattr(uploads_router, "OUTPUT_DIR", output_dir)
    monkeypatch.setattr(conversion_service, "OUTPUT_DIR", output_dir)
    monkeypatch.setattr(storage, "UPLOAD_DIR", upload_dir)
    monkeypatch.setattr(storage, "OUTPUT_DIR", output_dir)
    monkeypatch.setattr(pdf_service, "OUTPUT_DIR", output_dir)
    monkeypatch.setattr(security_service, "OUTPUT_DIR", output_dir)
    monkeypatch.setattr(outputs_router, "OUTPUT_DIR", output_dir)

    return upload_dir, output_dir


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
