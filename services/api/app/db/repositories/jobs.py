from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import PDFJob


def create_job(
    db: Session,
    operation: str,
    original_filename: str | None = None,
) -> PDFJob:
    """Create and persist a new PDF processing job."""
    job = PDFJob(
        operation=operation,
        original_filename=original_filename,
    )

    db.add(job)
    db.commit()
    db.refresh(job)

    return job


def get_job_by_public_id(
    db: Session,
    public_id: UUID,
) -> PDFJob | None:
    """Retrieve a job using its public UUID."""
    statement = select(PDFJob).where(
        PDFJob.public_id == str(public_id)
    )
    return db.scalar(statement)


def list_jobs(
    db: Session,
    limit: int = 50,
    offset: int = 0,
) -> list[PDFJob]:
    """Return jobs ordered by newest first."""
    statement = (
        select(PDFJob)
        .order_by(PDFJob.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    return list(db.scalars(statement).all())


def update_job_status(
    db: Session,
    job: PDFJob,
    status: str,
    *,
    output_filename: str | None = None,
    error_message: str | None = None,
) -> PDFJob:
    """Update a job's status and associated output or error details."""
    job.status = status

    if output_filename is not None:
        job.output_filename = output_filename

    if error_message is not None:
        job.error_message = error_message

    if status in {"completed", "failed"}:
        job.completed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(job)

    return job


def delete_job(db: Session, job: PDFJob) -> None:
    """Delete a PDF processing job."""
    db.delete(job)
    db.commit()