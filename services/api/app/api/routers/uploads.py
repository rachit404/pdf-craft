
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pypdf.errors import PdfReadError

from app.schemas.uploads import PDFUploadResponse
from app.services.pdf_service import (
    compress_document,
    extract_document_text,
    inspect_document,
)
from app.storage import UPLOAD_DIR, ensure_storage_dirs, sanitize_filename


MAX_UPLOAD_BYTES = 25 * 1024 * 1024
PDF_SIGNATURE = b"%PDF-"

router = APIRouter(
    prefix="/uploads",
    tags=["Uploads"],
)


def resolve_stored_file(filename: str) -> Path:
    """Resolve an uploaded PDF safely inside upload storage."""
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
            detail="PDF file was not found.",
        )

    return file_path


@router.post(
    "",
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


@router.get("/{stored_filename}/info")
def get_uploaded_pdf_info(stored_filename: str) -> dict:
    """Return basic metadata for a stored PDF."""
    file_path = resolve_stored_file(stored_filename)

    try:
        return inspect_document(file_path)

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


@router.get("/{stored_filename}/text")
def get_uploaded_pdf_text(stored_filename: str) -> dict:
    """Extract selectable text from a stored PDF."""
    file_path = resolve_stored_file(stored_filename)

    try:
        return extract_document_text(file_path)

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


@router.post("/{stored_filename}/compress")
def compress_uploaded_pdf(stored_filename: str) -> dict:
    """Compress an uploaded PDF and save the result locally."""
    file_path = resolve_stored_file(stored_filename)

    try:
        return compress_document(file_path)

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save the compressed PDF.",
        ) from exc
