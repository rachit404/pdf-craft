
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from app.storage import OUTPUT_DIR, sanitize_filename


router = APIRouter(
    prefix="/outputs",
    tags=["Outputs"],
)


def resolve_output_file(filename: str) -> Path:
    """Resolve an output filename safely inside output storage."""
    try:
        safe_filename = sanitize_filename(filename)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid output filename.",
        ) from exc

    if (
        safe_filename != filename
        or not safe_filename.lower().endswith(".pdf")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid output filename.",
        )

    root = OUTPUT_DIR.resolve()
    file_path = (root / safe_filename).resolve()

    if file_path.parent != root:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path.",
        )

    if not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF output was not found.",
        )

    return file_path


@router.get("/{output_filename}")
def download_processed_pdf(output_filename: str) -> FileResponse:
    """Download a locally stored processed PDF."""
    file_path = resolve_output_file(output_filename)

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=file_path.name,
    )
