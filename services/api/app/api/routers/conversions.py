
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.api.routers.uploads import resolve_stored_file
from app.schemas.conversions import (
    ImagesToPDFRequest,
    PDFToImagesRequest,
    PDFToPPTXRequest,
)
from app.services import conversion_service
from app.storage import UPLOAD_DIR, ensure_storage_dirs, sanitize_filename


router = APIRouter(prefix="/conversions", tags=["PDF Conversions"])

MAX_DOCUMENT_BYTES = 25 * 1024 * 1024


def _execute(function, *args, **kwargs):
    try:
        return function(*args, **kwargs)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except OSError as exc:
        raise HTTPException(422, "Could not process the supplied document.") from exc
    except Exception as exc:
        raise HTTPException(422, "Conversion failed. Check the input document.") from exc


def _resolve_image(filename: str) -> Path:
    try:
        safe_name = sanitize_filename(filename)
    except ValueError as exc:
        raise HTTPException(400, "Invalid image filename.") from exc

    if safe_name != filename or Path(safe_name).suffix.lower() not in {
        ".png", ".jpg", ".jpeg"
    }:
        raise HTTPException(400, "Invalid image filename.")

    root = UPLOAD_DIR.resolve()
    path = (root / safe_name).resolve()

    if path.parent != root:
        raise HTTPException(400, "Invalid image path.")

    if not path.is_file():
        raise HTTPException(404, "Uploaded image was not found.")

    return path


async def _save_document_upload(file: UploadFile, extension: str) -> Path:
    original_name = sanitize_filename(file.filename or "")

    if Path(original_name).suffix.lower() != extension:
        raise HTTPException(
            415,
            f"Only {extension} files are accepted.",
        )

    ensure_storage_dirs()

    destination = UPLOAD_DIR / f"{uuid4().hex}{extension}"
    total_bytes = 0

    try:
        with destination.open("xb") as output:
            while chunk := await file.read(1024 * 1024):
                total_bytes += len(chunk)

                if total_bytes > MAX_DOCUMENT_BYTES:
                    raise HTTPException(
                        413,
                        "Document exceeds the 25 MB upload limit.",
                    )

                output.write(chunk)

        if total_bytes == 0:
            raise HTTPException(400, "Uploaded document is empty.")

        return destination

    except Exception:
        destination.unlink(missing_ok=True)
        raise

    finally:
        await file.close()


@router.post("/pdf-to-images")
def convert_pdf_to_images(
    request: PDFToImagesRequest,
    filename: str,
):
    return _execute(
        conversion_service.pdf_to_images,
        resolve_stored_file(filename),
        request.image_format,
        request.dpi,
    )


@router.post("/images-to-pdf")
def convert_images_to_pdf(request: ImagesToPDFRequest):
    paths = [_resolve_image(name) for name in request.filenames]
    return _execute(conversion_service.images_to_pdf, paths)


@router.post("/{filename}/to-docx")
def convert_pdf_to_docx(filename: str):
    return _execute(
        conversion_service.pdf_to_docx,
        resolve_stored_file(filename),
    )


@router.post("/{filename}/to-xlsx")
def convert_pdf_to_xlsx(filename: str):
    return _execute(
        conversion_service.pdf_to_xlsx,
        resolve_stored_file(filename),
    )


@router.post("/{filename}/to-pptx")
def convert_pdf_to_pptx(
    filename: str,
    request: PDFToPPTXRequest,
):
    return _execute(
        conversion_service.pdf_to_pptx,
        resolve_stored_file(filename),
        request.dpi,
    )


@router.post("/docx-to-pdf", status_code=status.HTTP_200_OK)
async def convert_docx_to_pdf(file: UploadFile = File(...)):
    path = await _save_document_upload(file, ".docx")

    try:
        return _execute(conversion_service.docx_to_pdf, path)
    finally:
        path.unlink(missing_ok=True)


@router.post("/pptx-to-pdf", status_code=status.HTTP_200_OK)
async def convert_pptx_to_pdf(file: UploadFile = File(...)):
    path = await _save_document_upload(file, ".pptx")

    try:
        return _execute(conversion_service.pptx_to_pdf, path)
    finally:
        path.unlink(missing_ok=True)
