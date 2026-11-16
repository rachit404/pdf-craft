"""The file library: everything stored, with where each file came from."""

import tempfile
import zipfile
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from PIL import Image, UnidentifiedImageError

from app import storage
from app.api.routers.conversions import MAIN_PARTS, _check_office_archive
from app.api.routers.outputs import _download_name
from app.config import MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES
from app.schemas.files import StoredFileResponse
from app.schemas.tools import ZipRequest
from app.services import file_store, search_service


router = APIRouter(prefix="/files", tags=["Files"])

OWNER = file_store.DEFAULT_OWNER

MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".zip": "application/zip",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SIGNATURE = b"\xff\xd8\xff"
ZIP_SIGNATURE = b"PK\x03\x04"


def _sniff(head: bytes, path: Path) -> tuple[str, str]:
    """(kind, extension) from what the file really contains."""
    if head.startswith(b"%PDF-"):
        return "pdf", ".pdf"

    if head.startswith(PNG_SIGNATURE) or head.startswith(JPEG_SIGNATURE):
        try:
            with Image.open(path) as image:
                image_format = image.format
                image.verify()
        except (UnidentifiedImageError, OSError) as error:
            raise HTTPException(415, "Invalid image file.") from error

        if image_format == "PNG":
            return "image", ".png"
        if image_format == "JPEG":
            return "image", ".jpg"

    if head.startswith(ZIP_SIGNATURE):
        try:
            with zipfile.ZipFile(path) as archive:
                names = set(archive.namelist())
        except zipfile.BadZipFile as error:
            raise HTTPException(415, "This is not a supported document.") from error

        for extension, part in MAIN_PARTS.items():
            if part in names:
                _check_office_archive(path, extension)
                return extension.lstrip("."), extension

    raise HTTPException(415, "Upload a PDF, PNG or JPEG image, or a Word or PowerPoint file.")


def _response(record: dict) -> StoredFileResponse:
    return StoredFileResponse(**record)


@router.post("", response_model=StoredFileResponse, status_code=status.HTTP_201_CREATED)
async def upload(file: UploadFile = File(...)) -> StoredFileResponse:
    """Store a file of any supported kind; the kind is read from its content."""
    storage.ensure_storage_dirs()
    original = storage.sanitize_filename(file.filename or "")
    scratch = storage.UPLOAD_DIR / f"{uuid4().hex}.upload"
    total = 0

    try:
        with scratch.open("xb") as output:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)

                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.")

                output.write(chunk)

        if total == 0:
            raise HTTPException(400, "The uploaded file is empty.")

        with scratch.open("rb") as stream:
            head = stream.read(16)

        kind, extension = _sniff(head, scratch)

        if kind == "image" and total > MAX_IMAGE_BYTES:
            raise HTTPException(413, f"Image exceeds the {MAX_IMAGE_BYTES // (1024 * 1024)} MB limit.")

        stored = f"{uuid4().hex}{extension}"
        scratch.replace(storage.UPLOAD_DIR / stored)
    except Exception:
        scratch.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    await run_in_threadpool(
        file_store.register, stored, kind=kind, original_name=original, size=total
    )

    return _response(file_store.get(stored))


@router.get("", response_model=list[StoredFileResponse])
def list_files(
    kind: str | None = Query(default=None, max_length=16),
    include_intermediate: bool = False,
    limit: int = Query(default=100, ge=1, le=500),
) -> list[StoredFileResponse]:
    return [
        _response(record)
        for record in file_store.list_files(OWNER, kind, include_intermediate, limit)
    ]


MAX_ZIP_BYTES = 500 * 1024 * 1024


@router.post("/zip")
def download_zip(request: ZipRequest) -> FileResponse:
    """Several stored files in one ZIP, each named after its document and what was done to it."""
    chosen = []

    for name in dict.fromkeys(request.names):
        path = file_store.locate(name)

        if path is None:
            raise HTTPException(404, "One of the files is gone.")

        chosen.append((name, path))

    if sum(path.stat().st_size for _, path in chosen) > MAX_ZIP_BYTES:
        raise HTTPException(413, "These files are too large to zip together (limit 500 MB).")

    handle = tempfile.NamedTemporaryFile(prefix="pdfcraft-", suffix=".zip", delete=False)
    handle.close()
    archive_path = Path(handle.name)
    used: set[str] = set()

    try:
        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
            for name, path in chosen:
                record = file_store.get(name)
                base = record["original_name"] if record else name

                if record and record["operation"]:
                    base = f"{Path(base).stem}-{record['operation']}"

                entry = _download_name(base, path)
                stem, suffix = Path(entry).stem, Path(entry).suffix
                number = 1

                while entry in used:
                    number += 1
                    entry = f"{stem} ({number}){suffix}"

                used.add(entry)
                archive.write(path, entry)
    except Exception:
        archive_path.unlink(missing_ok=True)
        raise

    return FileResponse(
        archive_path,
        media_type="application/zip",
        filename="pdf-craft-files.zip",
        background=BackgroundTask(archive_path.unlink, missing_ok=True),
    )


@router.get("/search")
def search_files(q: str = Query(min_length=2, max_length=100)) -> dict:
    """Find a word or phrase inside stored PDFs."""
    try:
        return search_service.search(OWNER, q)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.get("/{file_name}", response_model=StoredFileResponse)
def get_file(file_name: str) -> StoredFileResponse:
    record = file_store.get(file_name)

    if record is None:
        raise HTTPException(404, "File not found.")

    return _response(record)


@router.get("/{file_name}/versions", response_model=list[StoredFileResponse])
def get_versions(file_name: str) -> list[StoredFileResponse]:
    """The versions that led to this file: the original first, this file last."""
    chain = file_store.ancestry(file_name)

    if chain is None:
        raise HTTPException(404, "File not found.")

    return [_response(record) for record in chain]


@router.get("/{file_name}/family", response_model=list[StoredFileResponse])
def get_family(file_name: str) -> list[StoredFileResponse]:
    """Every file made from the same original, including other branches."""
    related = file_store.family(file_name)

    if related is None:
        raise HTTPException(404, "File not found.")

    return [_response(record) for record in related]


@router.get("/{file_name}/download")
def download(
    file_name: str,
    name: str | None = Query(default=None, max_length=200),
) -> FileResponse:
    path = file_store.locate(file_name)

    if path is None:
        raise HTTPException(404, "File not found.")

    record = file_store.get(file_name)
    suffix = path.suffix.lower()

    if name is None and record and record["operation"]:
        # A result without a chosen name: "contract-rotate.pdf".
        name = f"{Path(record['original_name']).stem}-{record['operation']}"
    elif name is None and record:
        name = record["original_name"]

    return FileResponse(
        path,
        media_type=MEDIA_TYPES.get(suffix, "application/octet-stream"),
        filename=_download_name(name, path),
    )


@router.delete("/{file_name}")
def delete_file(file_name: str) -> dict[str, str]:
    if not file_store.remove(file_name):
        raise HTTPException(404, "File not found.")

    return {"deleted": file_name}
