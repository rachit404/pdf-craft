
from pydantic import BaseModel


class PDFUploadResponse(BaseModel):
    message: str
    original_filename: str
    stored_filename: str
    size_bytes: int
