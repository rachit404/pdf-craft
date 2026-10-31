
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PDFJob


def create_job(
    db: Session,
    operation: str,
    original_filename: str | None = None,
) -> PDFJob:
    """Create and persist a new PDF processing job."""
    job = PDFJob(
        operation=operation,
        status="pending",
        original_filename=original_filename,
    )

    db.add(job)
    db.commit()
    db.refresh(job)

    return job


def list_jobs(
    db: Session,
    limit: int = 50,
    offset: int = 0,
) -> list[PDFJob]:
    """Return the most recently created PDF jobs."""
    statement = (
        select(PDFJob)
        .order_by(PDFJob.created_at.desc(), PDFJob.id.desc())
        .offset(offset)
        .limit(limit)
    )

    return list(db.scalars(statement).all())
