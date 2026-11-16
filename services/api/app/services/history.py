"""Record which outputs were produced so they can be listed and re-downloaded.

History is a convenience: a database problem here must never fail the PDF
operation itself, so every public function swallows and logs its errors.
"""

import logging
from collections.abc import Iterable

from sqlalchemy import delete, select

from app.db.models import PDFJob, StoredUpload, utc_now
from app.db.session import SessionLocal


logger = logging.getLogger(__name__)


def remember_upload(stored_filename: str, original_filename: str) -> None:
    try:
        with SessionLocal() as db:
            db.merge(
                StoredUpload(
                    stored_filename=stored_filename,
                    original_filename=original_filename[:255],
                )
            )
            db.commit()
    except Exception:
        logger.warning("Could not record the upload name.", exc_info=True)


def source_label(stored_filenames: Iterable[str]) -> str | None:
    """Original name of the first file, plus a count when there are more."""
    names = list(stored_filenames)

    if not names:
        return None

    try:
        with SessionLocal() as db:
            first = db.get(StoredUpload, names[0])
    except Exception:
        logger.warning("Could not look up the upload name.", exc_info=True)
        return None

    if first is None:
        return None

    extra = len(names) - 1

    return (
        f"{first.original_filename} + {extra} more"
        if extra
        else first.original_filename
    )


def record_output(
    operation: str,
    source_name: str | None,
    output_filename: str,
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


def forget_missing(existing_uploads: set[str], existing_outputs: set[str]) -> None:
    """Drop rows whose files are no longer on disk."""
    try:
        with SessionLocal() as db:
            stale_uploads = [
                name
                for name in db.scalars(select(StoredUpload.stored_filename))
                if name not in existing_uploads
            ]
            stale_jobs = [
                job_id
                for job_id, output in db.execute(
                    select(PDFJob.id, PDFJob.output_filename)
                )
                if output is not None and output not in existing_outputs
            ]

            if stale_uploads:
                db.execute(
                    delete(StoredUpload).where(
                        StoredUpload.stored_filename.in_(stale_uploads)
                    )
                )

            if stale_jobs:
                db.execute(delete(PDFJob).where(PDFJob.id.in_(stale_jobs)))

            db.commit()
    except Exception:
        logger.warning("Could not prune history.", exc_info=True)
