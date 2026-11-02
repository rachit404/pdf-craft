
from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PDFOperation(str, Enum):
    MERGE = "merge"
    SPLIT = "split"
    COMPRESS = "compress"
    ROTATE = "rotate"
    WATERMARK = "watermark"
    EXTRACT_TEXT = "extract_text"
    OCR = "ocr"


class PDFJobCreate(BaseModel):
    operation: PDFOperation
    original_filename: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
    )


class PDFJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    public_id: UUID
    operation: str
    status: str
    original_filename: str | None
    output_filename: str | None
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None
