
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_health_endpoint(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_database_health_endpoint(client):
    response = client.get("/health/database")

    assert response.status_code == 200


def test_list_jobs_endpoint(client):
    response = client.get("/jobs")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_missing_output_returns_404(client):
    response = client.get("/outputs/nonexistent-test-file.pdf")

    assert response.status_code == 404


def test_openapi_schema_contains_expected_routes(client):
    response = client.get("/openapi.json")

    assert response.status_code == 200

    paths = response.json()["paths"]

    expected_paths = {
        "/health",
        "/health/database",
        "/jobs",
        "/jobs/{public_id}",
        "/uploads",
        "/uploads/{stored_filename}/info",
        "/uploads/{stored_filename}/text",
        "/uploads/{stored_filename}/compress",
        "/outputs/{output_filename}",
    }

    assert expected_paths.issubset(paths.keys())


def test_upload_rejects_non_pdf_file(client):
    response = client.post(
        "/uploads",
        files={
            "file": (
                "notes.txt",
                b"This is not a PDF.",
                "text/plain",
            )
        },
    )

    assert response.status_code == 415
