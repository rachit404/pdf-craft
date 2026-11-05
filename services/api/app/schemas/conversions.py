
from typing import Literal

from pydantic import BaseModel, Field


class PDFToImagesRequest(BaseModel):
    image_format: Literal["png", "jpeg"] = "png"
    dpi: int = Field(default=150, ge=50, le=300)


class PDFToPPTXRequest(BaseModel):
    dpi: int = Field(default=150, ge=50, le=300)


class ImagesToPDFRequest(BaseModel):
    filenames: list[str] = Field(min_length=1, max_length=100)
