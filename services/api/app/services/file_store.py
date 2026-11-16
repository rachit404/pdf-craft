"""Where every stored file came from.

Uploads and results both live in the storage folders under random names. This
module keeps one row per file with its kind, its original name and the file it
was made from, which gives each document a version history and lets any result
be used as the input of the next operation.

Like the history module, failures here are logged, never raised: bookkeeping
must not break a PDF operation that already succeeded.
"""

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, select

from app import storage
from app.db.models import PDFJob, StoredFile, utc_now
from app.db.session import SessionLocal
from app.services import retention_settings


logger = logging.getLogger(__name__)

DEFAULT_OWNER = "local"

KIND_BY_EXTENSION = {
    ".pdf": "pdf",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".docx": "docx",
    ".pptx": "pptx",
    ".xlsx": "xlsx",
    ".zip": "zip",
}


def kind_of(name: str) -> str:
    return KIND_BY_EXTENSION.get(Path(name).suffix.lower(), "other")


def locate(name: str) -> Path | None:
    """Path of a stored file in uploads or results, or None.

    Only plain file names are accepted, so a request can never reach outside
    the storage folders.
    """
    if not name or name != Path(name.replace("\\", "/")).name or name.startswith("."):
        return None

    for root in (storage.UPLOAD_DIR, storage.OUTPUT_DIR):
        base = root.resolve()
        path = (base / name).resolve()

        if path.parent == base and path.is_file():
            return path

    return None


def expires_at(created: datetime) -> datetime | None:
    hours = retention_settings.hours()

    return created + timedelta(hours=hours) if hours > 0 else None


def to_dict(row: StoredFile) -> dict:
    created = row.created_at

    if created.tzinfo is None:
        created = created.replace(tzinfo=utc_now().tzinfo)

    return {
        "name": row.name,
        "kind": row.kind,
        "original_name": row.original_name,
        "size_bytes": row.size_bytes,
        "parent_name": row.parent_name,
        "root_name": row.root_name,
        "sources": json.loads(row.sources or "[]"),
        "operation": row.operation,
        "intermediate": row.intermediate,
        "created_at": created,
        "expires_at": expires_at(created),
        "available": locate(row.name) is not None,
    }


def register(
    name: str,
    *,
    kind: str | None = None,
    original_name: str | None = None,
    size: int | None = None,
    operation: str | None = None,
    sources: list[str] | tuple[str, ...] = (),
    intermediate: bool = False,
    owner: str = DEFAULT_OWNER,
) -> None:
    """Record a file. Results inherit the original name of their document."""
    try:
        with SessionLocal() as db:
            parent = db.get(StoredFile, sources[0]) if sources else None
            path = locate(name)

            db.merge(
                StoredFile(
                    name=name,
                    owner_id=owner,
                    kind=kind or kind_of(name),
                    original_name=(
                        original_name
                        or (parent.original_name if parent else None)
                        or name
                    )[:255],
                    size_bytes=size if size is not None else (path.stat().st_size if path else 0),
                    parent_name=sources[0] if sources else None,
                    root_name=(parent.root_name if parent else (sources[0] if sources else name)),
                    sources=json.dumps(list(sources)),
                    operation=operation,
                    intermediate=intermediate,
                )
            )
            db.commit()
    except Exception:
        logger.warning("Could not record the file.", exc_info=True)


def set_intermediate(names: list[str], value: bool) -> None:
    try:
        with SessionLocal() as db:
            for name in names:
                row = db.get(StoredFile, name)

                if row is not None:
                    row.intermediate = value

            db.commit()
    except Exception:
        logger.warning("Could not update the file.", exc_info=True)


def get(name: str) -> dict | None:
    with SessionLocal() as db:
        row = db.get(StoredFile, name)

        return to_dict(row) if row else None


def list_files(
    owner: str = DEFAULT_OWNER,
    kind: str | None = None,
    include_intermediate: bool = False,
    limit: int = 200,
) -> list[dict]:
    statement = select(StoredFile).where(StoredFile.owner_id == owner)

    if kind:
        statement = statement.where(StoredFile.kind == kind)

    if not include_intermediate:
        statement = statement.where(StoredFile.intermediate.is_(False))

    statement = statement.order_by(StoredFile.created_at.desc()).limit(limit)

    with SessionLocal() as db:
        return [to_dict(row) for row in db.scalars(statement)]


def ancestry(name: str) -> list[dict] | None:
    """The versions leading to a file: the original first, the file last.

    None when the file is unknown. Files made from the same ancestor by other
    operations are not included (see `family`).
    """
    chain: list[dict] = []
    current: str | None = name

    with SessionLocal() as db:
        while current is not None and len(chain) < 200:
            row = db.get(StoredFile, current)

            if row is None:
                break

            chain.append(to_dict(row))
            current = row.parent_name

    return list(reversed(chain)) if chain else None


def family(name: str) -> list[dict] | None:
    """Every file of the same document, oldest first. None when unknown."""
    with SessionLocal() as db:
        row = db.get(StoredFile, name)

        if row is None:
            return None

        family = db.scalars(
            select(StoredFile)
            .where(StoredFile.root_name == row.root_name)
            .order_by(StoredFile.created_at)
        )

        return [to_dict(item) for item in family]


def remove(name: str) -> bool:
    """Delete a file from disk and the records. False when it is unknown."""
    path = locate(name)

    with SessionLocal() as db:
        row = db.get(StoredFile, name)

        if row is None and path is None:
            return False

        if row is not None:
            db.delete(row)

        db.execute(delete(PDFJob).where(PDFJob.output_filename == name))
        db.commit()

    if path is not None:
        path.unlink(missing_ok=True)

    return True
