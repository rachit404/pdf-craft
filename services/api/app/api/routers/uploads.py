from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError
from pypdf.errors import PdfReadError

from app.schemas.uploads import PDFUploadResponse
from app.services.pdf_service import (
    compress_document,
    extract_document_text,
    inspect_document,
)
from app.storage import UPLOAD_DIR, ensure_storage_dirs, sanitize_filename


MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_IMAGE_BYTES = 10 * 1024 * 1024
PDF_SIGNATURE = b"%PDF-"

IMAGE_FORMATS = {
    "PNG": (".png", "image/png"),
    "JPEG": (".jpg", "image/jpeg"),
}

router = APIRouter(prefix="/uploads", tags=["Uploads"])


def resolve_stored_file(filename: str) -> Path:
    try:
        safe_filename = sanitize_filename(filename)
    except ValueError as exc:
        raise HTTPException(400, "Invalid PDF filename.") from exc

    if safe_filename != filename or not safe_filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Invalid PDF filename.")

    root = UPLOAD_DIR.resolve()
    file_path = (root / safe_filename).resolve()

    if file_path.parent != root:
        raise HTTPException(400, "Invalid file path.")

    if not file_path.is_file():
        raise HTTPException(404, "PDF file was not found.")

    return file_path


@router.post(
    "",
    response_model=PDFUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_pdf(file: UploadFile = File(...)) -> PDFUploadResponse:
    try:
        original_filename = sanitize_filename(file.filename or "")

        if Path(original_filename).suffix.lower() != ".pdf":
            raise HTTPException(415, "Only PDF files are accepted.")

        if file.content_type != "application/pdf":
            raise HTTPException(415, "Invalid PDF content type.")

        ensure_storage_dirs()

        stored_filename = f"{uuid4().hex}.pdf"
        destination = UPLOAD_DIR / stored_filename
        total_bytes = 0
        first_chunk = True

        try:
            with destination.open("xb") as output:
                while chunk := await file.read(1024 * 1024):
                    total_bytes += len(chunk)

                    if total_bytes > MAX_UPLOAD_BYTES:
                        raise HTTPException(413, "PDF exceeds the 25 MB limit.")

                    if first_chunk:
                        first_chunk = False
                        if not chunk.startswith(PDF_SIGNATURE):
                            raise HTTPException(415, "Invalid PDF signature.")

                    output.write(chunk)

            if total_bytes == 0:
                raise HTTPException(400, "The uploaded file is empty.")

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
        raise HTTPException(400, str(exc)) from exc

    finally:
        await file.close()


@router.post("/image", status_code=status.HTTP_201_CREATED)
async def upload_image(file: UploadFile = File(...)) -> dict:
    """Upload a PNG or JPEG image for insertion into a PDF."""
    temporary_path = None

    try:
        original_filename = sanitize_filename(file.filename or "")
        extension = Path(original_filename).suffix.lower()

        if extension not in {".png", ".jpg", ".jpeg"}:
            raise HTTPException(415, "Only PNG and JPEG images are supported.")

        ensure_storage_dirs()

        temporary_path = UPLOAD_DIR / f"{uuid4().hex}.upload"
        total_bytes = 0

        try:
            with temporary_path.open("xb") as output:
                while chunk := await file.read(1024 * 1024):
                    total_bytes += len(chunk)

                    if total_bytes > MAX_IMAGE_BYTES:
                        raise HTTPException(413, "Image exceeds the 10 MB limit.")

                    output.write(chunk)

            if total_bytes == 0:
                raise HTTPException(400, "The uploaded image is empty.")

            try:
                with Image.open(temporary_path) as image:
                    image_format = image.format

                    if image_format not in IMAGE_FORMATS:
                        raise HTTPException(
                            415,
                            "Only PNG and JPEG images are supported.",
                        )

                    image.verify()

            except (UnidentifiedImageError, OSError) as exc:
                raise HTTPException(415, "Invalid image file.") from exc

            expected_extension, expected_content_type = IMAGE_FORMATS[image_format]

            if file.content_type != expected_content_type:
                raise HTTPException(415, "Image content type does not match its format.")

            stored_filename = f"{uuid4().hex}{expected_extension}"
            destination = UPLOAD_DIR / stored_filename
            temporary_path.replace(destination)
            temporary_path = None

            return {
                "message": "Image uploaded successfully.",
                "original_filename": original_filename,
                "stored_filename": stored_filename,
                "content_type": expected_content_type,
                "size_bytes": total_bytes,
            }

        except Exception:
            if temporary_path:
                temporary_path.unlink(missing_ok=True)
            raise

    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    finally:
        await file.close()


@router.get("/{stored_filename}/info")
def get_uploaded_pdf_info(stored_filename: str) -> dict:
    file_path = resolve_stored_file(stored_filename)

    try:
        return inspect_document(file_path)
    except PdfReadError as exc:
        raise HTTPException(422, "Stored file is not a valid PDF.") from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except OSError as exc:
        raise HTTPException(500, "Could not inspect the PDF.") from exc


@router.get("/{stored_filename}/text")
def get_uploaded_pdf_text(stored_filename: str) -> dict:
    file_path = resolve_stored_file(stored_filename)

    try:
        return extract_document_text(file_path)
    except (ValueError, PdfReadError) as exc:
        raise HTTPException(422, "Could not extract PDF text.") from exc
    except OSError as exc:
        raise HTTPException(500, "Could not extract PDF text.") from exc


@router.post("/{stored_filename}/compress")
def compress_uploaded_pdf(stored_filename: str) -> dict:
    file_path = resolve_stored_file(stored_filename)

    try:
        return compress_document(file_path)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except OSError as exc:
        raise HTTPException(500, "Could not compress the PDF.") from exc