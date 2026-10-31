
import os
from pathlib import Path


API_DIR = Path(__file__).resolve().parents[1]

# Override this with PDF_CRAFT_STORAGE_DIR if needed.
_storage_override = os.getenv("PDF_CRAFT_STORAGE_DIR")

STORAGE_ROOT = (
    Path(_storage_override).expanduser().resolve()
    if _storage_override
    else API_DIR / "data" / "files"
)

UPLOAD_DIR = STORAGE_ROOT / "uploads"
OUTPUT_DIR = STORAGE_ROOT / "outputs"


def ensure_storage_dirs() -> None:
    """Create the local directories used for PDF files."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def sanitize_filename(filename: str) -> str:
    """Return a filename without directory components."""
    name = filename.replace("\\", "/").split("/")[-1].strip()

    if not name or name in {".", ".."}:
        raise ValueError("A valid filename is required.")

    if "\x00" in name:
        raise ValueError("Filename contains an invalid character.")

    return name
