
from datetime import datetime
from enum import Enum
from pathlib import Path
from uuid import uuid4

from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from pydantic import BaseModel, ConfigDict, Field
from pypdf.errors import PdfReadError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models import PDFJob
from app.pdf_inspector import inspect_pdf
from app.pdf_text import extract_pdf_text
from app.repositories import create_job, list_jobs
from app.storage import UPLOAD_DIR, ensure_storage_dirs, sanitize_filename


MAX_UPLOAD_BYTES = 25 * 1024 * 1024
PDF_SIGNATURE = b"%PDF-"

app = FastAPI(
    title="PDF Craft API",
    description="Local-first PDF processing service.",
    version="0.1.0",
)


class PDFOperation(str, Enum):
    MERGE = "merge"
    SPLIT = "split"
    COMPRESS = "compress"
    ROTATE = "rotate"
    WATERMARK = "watermark"
    EXTRACT_TEXT = "extract_text"
    OCR = "ocr"


class PDFJobCreate(BaseModel):
    operation: PDFOperation
    original_filename: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
    )


class PDFJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    operation: str
    status: str
    original_filename: str | None
    output_filename: str | None
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None


class PDFUploadResponse(BaseModel):
    message: str
    original_filename: str
    stored_filename: str
    size_bytes: int


def get_stored_pdf_path(stored_filename: str) -> Path:
    """Resolve a stored PDF filename safely inside the upload directory."""
    try:
        safe_filename = sanitize_filename(stored_filename)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid stored PDF filename.",
        ) from exc

    if (
        safe_filename != stored_filename
        or not safe_filename.lower().endswith(".pdf")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid stored PDF filename.",
        )

    root = UPLOAD_DIR.resolve()
    file_path = (root / safe_filename).resolve()

    if file_path.parent != root:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path.",
        )

    if not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Uploaded PDF was not found.",
        )

    return file_path


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/database")
def database_health_check(
    db: Session = Depends(get_db),
) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed.",
        ) from exc


@app.post(
    "/jobs",
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


@app.get("/jobs", response_model=list[PDFJobResponse])
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


@app.post(
    "/uploads",
    response_model=PDFUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_pdf(
    file: UploadFile = File(...),
) -> PDFUploadResponse:
    """Validate and save a PDF in local storage."""
    try:
        original_filename = sanitize_filename(file.filename or "")

        if Path(original_filename).suffix.lower() != ".pdf":
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Only PDF files are accepted.",
            )

        if file.content_type != "application/pdf":
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="The uploaded file must have content type application/pdf.",
            )

        ensure_storage_dirs()

        stored_filename = f"{uuid4().hex}.pdf"
        destination = UPLOAD_DIR / stored_filename
        total_bytes = 0
        first_chunk = True

        try:
            with destination.open("xb") as output:
                while True:
                    chunk = await file.read(1024 * 1024)

                    if not chunk:
                        break

                    total_bytes += len(chunk)

                    if total_bytes > MAX_UPLOAD_BYTES:
                        raise HTTPException(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail="PDF exceeds the 25 MB upload limit.",
                        )

                    if first_chunk:
                        first_chunk = False
                        if not chunk.startswith(PDF_SIGNATURE):
                            raise HTTPException(
                                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                                detail="File does not have a valid PDF signature.",
                            )

                    output.write(chunk)

            if total_bytes == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The uploaded file is empty.",
                )

        except Exception:
            destination.unlink(missing_ok=True)
            raise

        return PDFUploadResponse(
            message="PDF uploaded successfully.",
            original_filename=original_filename,
            stored_filename=stored_filename,
            size_bytes=total_bytes,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    finally:
        await file.close()


@app.get("/uploads/{stored_filename}/info")
def get_uploaded_pdf_info(stored_filename: str) -> dict:
    """Return basic metadata for a stored PDF."""
    file_path = get_stored_pdf_path(stored_filename)

    try:
        return inspect_pdf(file_path)
    except PdfReadError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The stored file could not be read as a valid PDF.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not inspect the stored PDF.",
        ) from exc


@app.get("/uploads/{stored_filename}/text")
def get_uploaded_pdf_text(stored_filename: str) -> dict:
    """Extract selectable text from a stored PDF."""
    file_path = get_stored_pdf_path(stored_filename)

    try:
        return extract_pdf_text(file_path)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except PdfReadError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The stored PDF could not be read.",
        ) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not extract PDF text.",
        ) from exc
