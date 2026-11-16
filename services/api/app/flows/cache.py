"""Remember what a flow step produced, keyed by the step, its settings and its input files.

Running the same step on identical files again reuses the files already made.
A result is reused only while every file of it still exists. Set
PDF_CRAFT_FLOW_CACHE=0 to turn this off.
"""

import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import delete

from app.db.models import StepCache
from app.db.session import SessionLocal
from app.services import file_store

logger = logging.getLogger(__name__)

# Text with these tokens changes from day to day, so its results are never reused.
UNCACHEABLE_MARKERS = ("{date}",)


def enabled() -> bool:
    return os.getenv("PDF_CRAFT_FLOW_CACHE", "1").strip().lower() not in ("0", "false", "no", "off")


def _file_digest(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)

    return digest.hexdigest()


def key_for(operation_id: str, settings_json: str, inputs: dict[str, list[Path]]) -> str | None:
    """None when this step must always run."""
    if not enabled() or any(marker in settings_json for marker in UNCACHEABLE_MARKERS):
        return None

    try:
        parts = [operation_id, settings_json]

        for port in sorted(inputs):
            parts.append(f"{port}:" + ",".join(_file_digest(path) for path in inputs[port]))
    except OSError:
        return None

    return hashlib.sha256("\n".join(parts).encode()).hexdigest()


def lookup(key: str) -> list[Path] | None:
    """The files of an earlier run of this step, if all of them still exist."""
    try:
        with SessionLocal() as db:
            row = db.get(StepCache, key)

            if row is None:
                return None

            paths = [file_store.locate(name) for name in json.loads(row.outputs)]

            if not paths or any(path is None for path in paths):
                db.delete(row)
                db.commit()

                return None

            return [path for path in paths if path is not None]
    except Exception:
        logger.warning("Step cache lookup failed.", exc_info=True)
        return None


def store(key: str, made: list[Path]) -> None:
    try:
        with SessionLocal() as db:
            db.merge(StepCache(key=key, outputs=json.dumps([path.name for path in made])))
            db.commit()
    except Exception:
        logger.warning("Step cache store failed.", exc_info=True)


def prune(cutoff_timestamp: float) -> None:
    """Forget entries older than the retention cutoff (their files are gone too)."""
    try:
        cutoff = datetime.fromtimestamp(cutoff_timestamp, tz=timezone.utc)

        with SessionLocal() as db:
            db.execute(delete(StepCache).where(StepCache.created_at < cutoff))
            db.commit()
    except Exception:
        logger.warning("Could not prune the step cache.", exc_info=True)
