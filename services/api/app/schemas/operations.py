
from pydantic import BaseModel, Field, model_validator


class MergeRequest(BaseModel):
    filenames: list[str] = Field(min_length=2, max_length=20)


class PagesRequest(BaseModel):
    pages: list[int] = Field(min_length=1, max_length=500)


class ReorderRequest(BaseModel):
    order: list[int] = Field(min_length=1, max_length=500)


class RotateRequest(BaseModel):
    pages: list[int] = Field(min_length=1, max_length=500)
    degrees: int


class SplitRequest(BaseModel):
    ranges: list[list[int]] = Field(min_length=1, max_length=100)


class WatermarkRequest(BaseModel):
    text: str = Field(min_length=1, max_length=150)
    opacity: float = Field(default=0.25, ge=0, le=1)
    font_size: int = Field(default=48, ge=8, le=150)


class PageNumberRequest(BaseModel):
    position: str = "bottom-center"
    font_size: int = Field(default=10, ge=6, le=36)


class HeaderFooterRequest(BaseModel):
    header: str | None = Field(default=None, max_length=200)
    footer: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def require_content(self):
        if not self.header and not self.footer:
            raise ValueError("Provide a header or footer.")
        return self


class BackgroundRequest(BaseModel):
    red: float = Field(ge=0, le=1)
    green: float = Field(ge=0, le=1)
    blue: float = Field(ge=0, le=1)


class CropRequest(BaseModel):
    left: float = Field(ge=0)
    bottom: float = Field(ge=0)
    right: float = Field(ge=0)
    top: float = Field(ge=0)


class AddTextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    x: float
    y: float
    font_size: int = Field(default=12, ge=6, le=72)


class AddImageRequest(BaseModel):
    image_filename: str
    x: float
    y: float
    width: float = Field(gt=0)
    height: float = Field(gt=0)
