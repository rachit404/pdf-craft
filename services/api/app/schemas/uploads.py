
from typing import Literal

from pydantic import BaseModel


class PDFUploadResponse(BaseModel):
    message: str
    original_filename: str
    stored_filename: str
    size_bytes: int


class CompressRequest(BaseModel):
    # lossless keeps every pixel; the others re-encode images to save space.
    level: Literal["lossless", "balanced", "strong"] = "lossless"
