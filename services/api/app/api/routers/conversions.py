
import zipfile
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool

from app.api.recording import RecordedRoute
from app.config import MAX_UPLOAD_BYTES
from app.api.routers.uploads import resolve_stored_file, resolve_stored_image
from app.schemas.conversions import (
    ImagesToPDFRequest,
    PDFToImagesRequest,
    PDFToPPTXRequest,
)
from app.engines.pdf.office import find_soffice
from app.services import conversion_service
from app.storage import UPLOAD_DIR, ensure_storage_dirs, sanitize_filename


router = APIRouter(prefix="/conversions", tags=["PDF Conversions"], route_class=RecordedRoute)

MAX_DOCUMENT_BYTES = MAX_UPLOAD_BYTES
MAX_UNPACKED_BYTES = 250 * 1024 * 1024

# Every genuine Office Open XML file is a ZIP holding this main part.
MAIN_PARTS = {".docx": "word/document.xml", ".pptx": "ppt/presentation.xml"}
LABELS = {".docx": "Word", ".pptx": "PowerPoint"}


def _check_office_archive(path: Path, extension: str) -> None:
    """Reject files that are not real Office documents or unpack to huge sizes."""
    label = LABELS[extension]

    try:
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
            unpacked = sum(item.file_size for item in archive.infolist())
    except zipfile.BadZipFile as exc:
        raise HTTPException(415, f"This is not a valid {label} document.") from exc

    if "[Content_Types].xml" not in names or MAIN_PARTS[extension] not in names:
        raise HTTPException(415, f"This is not a valid {label} document.")

    if unpacked > MAX_UNPACKED_BYTES:
        raise HTTPException(413, f"The {label} document is too large once unpacked.")


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
                        f"Document exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit.",
                    )

                output.write(chunk)

        if total_bytes == 0:
            raise HTTPException(400, "Uploaded document is empty.")

        _check_office_archive(destination, extension)

        return destination

    except Exception:
        destination.unlink(missing_ok=True)
        raise

    finally:
        await file.close()


@router.get("/capabilities")
def conversion_capabilities() -> dict:
    """Report which engine converts Word/PowerPoint to PDF."""
    return {"office_engine": "libreoffice" if find_soffice() else "basic"}


@router.post("/{filename}/to-images")
def convert_pdf_to_images(
    filename: str,
    request: PDFToImagesRequest,
):
    return _execute(
        conversion_service.pdf_to_images,
        resolve_stored_file(filename),
        request.image_format,
        request.dpi,
    )


@router.post("/images-to-pdf")
def convert_images_to_pdf(request: ImagesToPDFRequest):
    paths = [resolve_stored_image(name) for name in request.filenames]
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
async def convert_docx_to_pdf(request: Request, file: UploadFile = File(...)):
    request.state.source_name = sanitize_filename(file.filename or "document.docx")
    path = await _save_document_upload(file, ".docx")

    try:
        return await run_in_threadpool(_execute, conversion_service.docx_to_pdf, path)
    finally:
        path.unlink(missing_ok=True)


@router.post("/pptx-to-pdf", status_code=status.HTTP_200_OK)
async def convert_pptx_to_pdf(request: Request, file: UploadFile = File(...)):
    request.state.source_name = sanitize_filename(file.filename or "slides.pptx")
    path = await _save_document_upload(file, ".pptx")

    try:
        return await run_in_threadpool(_execute, conversion_service.pptx_to_pdf, path)
    finally:
        path.unlink(missing_ok=True)
