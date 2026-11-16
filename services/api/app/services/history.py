"""Record which outputs were produced so they can be listed and re-downloaded.

History is a convenience: a database problem here must never fail the PDF
operation itself, so every public function swallows and logs its errors.
File bookkeeping (kind, version lineage) lives in `file_store`.
"""

import logging
from collections.abc import Iterable

from sqlalchemy import delete, select

from app.db.models import PDFJob, StoredFile, utc_now
from app.db.session import SessionLocal
from app.services import file_store


logger = logging.getLogger(__name__)


def remember_upload(
    stored_filename: str,
    original_filename: str,
    kind: str | None = None,
    size: int | None = None,
) -> None:
    file_store.register(
        stored_filename,
        kind=kind,
        original_name=original_filename,
        size=size,
    )


def source_label(stored_filenames: Iterable[str]) -> str | None:
    """Original name of the first file, plus a count when there are more."""
    names = list(stored_filenames)

    if not names:
        return None

    try:
        first = file_store.get(names[0])
    except Exception:
        logger.warning("Could not look up the upload name.", exc_info=True)
        return None

    if first is None:
        return None

    extra = len(names) - 1

    return (
        f"{first['original_name']} + {extra} more"
        if extra
        else first["original_name"]
    )


def record_output(
    operation: str,
    source_name: str | None,
    output_filename: str,
    sources: Iterable[str] = (),
) -> None:
    try:
        with SessionLocal() as db:
            db.add(
                PDFJob(
                    operation=operation[:50],
                    status="completed",
                    original_filename=source_name[:255] if source_name else None,
                    output_filename=output_filename,
                    completed_at=utc_now(),
                )
            )
            db.commit()
    except Exception:
        logger.warning("Could not record the output in history.", exc_info=True)

    file_store.register(
        output_filename,
        operation=operation[:50],
        sources=list(sources),
    )


def forget_missing(existing_uploads: set[str], existing_outputs: set[str]) -> None:
    """Drop rows whose files are no longer on disk."""
    on_disk = existing_uploads | existing_outputs

    try:
        with SessionLocal() as db:
            stale_files = [
                name
                for name in db.scalars(select(StoredFile.name))
                if name not in on_disk
            ]
            stale_jobs = [
                job_id
                for job_id, output in db.execute(
                    select(PDFJob.id, PDFJob.output_filename)
                )
                if output is not None and output not in existing_outputs
            ]

            if stale_files:
                db.execute(delete(StoredFile).where(StoredFile.name.in_(stale_files)))

            if stale_jobs:
                db.execute(delete(PDFJob).where(PDFJob.id.in_(stale_jobs)))

            db.commit()
    except Exception:
        logger.warning("Could not prune history.", exc_info=True)
