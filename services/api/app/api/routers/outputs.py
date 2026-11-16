
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.storage import OUTPUT_DIR, sanitize_filename


router = APIRouter(prefix="/outputs", tags=["Outputs"])

ALLOWED_OUTPUTS = {
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def resolve_output_file(filename: str) -> Path:
    try:
        safe_filename = sanitize_filename(filename)
    except ValueError as exc:
        raise HTTPException(400, "Invalid output filename.") from exc

    extension = Path(safe_filename).suffix.lower()

    if safe_filename != filename or extension not in ALLOWED_OUTPUTS:
        raise HTTPException(400, "Invalid output filename.")

    root = OUTPUT_DIR.resolve()
    file_path = (root / safe_filename).resolve()

    if file_path.parent != root:
        raise HTTPException(400, "Invalid file path.")

    if not file_path.is_file():
        raise HTTPException(404, "Output file was not found.")

    return file_path


def _download_name(requested: str | None, file_path: Path) -> str:
    """Use the caller's preferred name (sanitised) with the real extension."""
    if requested:
        stem = re.sub(r"[^\w\-. ()]", "_", Path(requested.replace("\\", "/")).stem)
        stem = stem.strip(" .")[:100]

        if stem:
            return f"{stem}{file_path.suffix.lower()}"

    return file_path.name


@router.get("/{output_filename}")
def download_processed_file(
    output_filename: str,
    name: str | None = Query(default=None, max_length=200),
) -> FileResponse:
    file_path = resolve_output_file(output_filename)

    return FileResponse(
        path=file_path,
        media_type=ALLOWED_OUTPUTS[file_path.suffix.lower()],
        filename=_download_name(name, file_path),
    )
