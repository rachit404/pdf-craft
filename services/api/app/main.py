
from pathlib import Path
from uuid import uuid4

from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pypdf.errors import PdfReadError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.routers.jobs import router as jobs_router
from app.dependencies import get_db
from app.pdf_compressor import compress_pdf
from app.pdf_inspector import inspect_pdf
from app.pdf_text import extract_pdf_text
from app.storage import (
    OUTPUT_DIR,
    UPLOAD_DIR,
    ensure_storage_dirs,
    sanitize_filename,
)


MAX_UPLOAD_BYTES = 25 * 1024 * 1024
PDF_SIGNATURE = b"%PDF-"

app = FastAPI(
    title="PDF Craft API",
    description="Local-first PDF processing service.",
    version="0.1.0",
)

# Register API routers.
app.include_router(jobs_router)


class PDFUploadResponse(BaseModel):
    message: str
    original_filename: str
    stored_filename: str
    size_bytes: int


def resolve_stored_file(filename: str, directory: Path) -> Path:
    """Resolve a PDF filename safely inside its designated directory."""
    try:
        safe_filename = sanitize_filename(filename)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid PDF filename.",
        ) from exc

    if (
        safe_filename != filename
        or not safe_filename.lower().endswith(".pdf")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid PDF filename.",
        )

    root = directory.resolve()
    file_path = (root / safe_filename).resolve()

    if file_path.parent != root:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path.",
        )

    if not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF file was not found.",
        )

    return file_path


def get_stored_pdf_path(stored_filename: str) -> Path:
    return resolve_stored_file(stored_filename, UPLOAD_DIR)


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


@app.post("/uploads/{stored_filename}/compress")
def compress_uploaded_pdf(stored_filename: str) -> dict:
    """Compress an uploaded PDF and save the result locally."""
    input_path = get_stored_pdf_path(stored_filename)

    ensure_storage_dirs()

    output_filename = f"{uuid4().hex}.pdf"
    output_path = OUTPUT_DIR / output_filename

    try:
        result = compress_pdf(input_path, output_path)

        return {
            "message": "PDF compression completed successfully.",
            "original_filename": stored_filename,
            **result,
        }

    except ValueError as exc:
        output_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except OSError as exc:
        output_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save the compressed PDF.",
        ) from exc


@app.get("/outputs/{output_filename}")
def download_compressed_pdf(output_filename: str) -> FileResponse:
    """Download a locally stored processed PDF."""
    file_path = resolve_stored_file(output_filename, OUTPUT_DIR)

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=file_path.name,
    )
