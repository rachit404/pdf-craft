
from pathlib import Path
from uuid import uuid4

from app.engines.pdf import security
from app.storage import OUTPUT_DIR, ensure_storage_dirs


def _run(operation, *args, extension=".pdf", **kwargs):
    ensure_storage_dirs()
    output = OUTPUT_DIR / f"{uuid4().hex}{extension}"

    try:
        return operation(*args, output=output, **kwargs)
    except Exception:
        output.unlink(missing_ok=True)
        raise


def protect_document(path: Path, **kwargs) -> dict:
    return _run(security.protect_pdf, path, **kwargs)


def unlock_document(path: Path, password: str) -> dict:
    return _run(security.unlock_pdf, path, password)


def redact_document(path: Path, regions: list[dict]) -> dict:
    return _run(security.redact_pdf, path, regions)


def sanitize_document(path: Path) -> dict:
    return _run(security.sanitize_pdf, path)
