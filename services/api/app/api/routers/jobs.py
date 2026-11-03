
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.dependencies import get_db
from app.db.models import PDFJob
from app.db.repositories.jobs import (
    create_job,
    delete_job,
    get_job_by_public_id,
    list_jobs,
)
from app.schemas.jobs import PDFJobCreate, PDFJobResponse


router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"],
)


@router.post(
    "",
    response_model=PDFJobResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_pdf_job(
    payload: PDFJobCreate,
    db: Session = Depends(get_db),
) -> PDFJob:
    try:
        return create_job(
            db=db,
            operation=payload.operation.value,
            original_filename=payload.original_filename,
        )
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create the PDF job.",
        ) from exc


@router.get("", response_model=list[PDFJobResponse])
def get_pdf_jobs(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[PDFJob]:
    try:
        return list_jobs(db=db, limit=limit, offset=offset)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve PDF jobs.",
        ) from exc


@router.get("/{public_id}", response_model=PDFJobResponse)
def get_pdf_job(
    public_id: UUID,
    db: Session = Depends(get_db),
) -> PDFJob:
    try:
        job = get_job_by_public_id(db=db, public_id=public_id)

        if job is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="PDF job was not found.",
            )

        return job
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve the PDF job.",
        ) from exc


@router.delete("/{public_id}")
def delete_pdf_job(
    public_id: UUID,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    try:
        job = get_job_by_public_id(db=db, public_id=public_id)

        if job is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="PDF job was not found.",
            )

        delete_job(db=db, job=job)

        return {"message": "PDF job deleted successfully."}
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete the PDF job.",
        ) from exc
