
from pathlib import Path

from fastapi import APIRouter, HTTPException
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


@router.get("/{output_filename}")
def download_processed_file(output_filename: str) -> FileResponse:
    file_path = resolve_output_file(output_filename)

    return FileResponse(
        path=file_path,
        media_type=ALLOWED_OUTPUTS[file_path.suffix.lower()],
        filename=file_path.name,
    )
