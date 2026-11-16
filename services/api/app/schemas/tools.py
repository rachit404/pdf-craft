from pydantic import BaseModel, Field


class BlankPagesRequest(BaseModel):
    ink_percent: float = Field(
        default=0.2,
        ge=0,
        le=5,
        title="Tolerance for specks (%)",
        description="Share of the page that may be dark and still count as blank. Raise it for noisy scans.",
    )


class FillFormRequest(BaseModel):
    values: dict[str, str | bool] = Field(default_factory=dict, max_length=500)
    flatten: bool = False


class FlattenRequest(BaseModel):
    """No settings."""


class MetadataRequest(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    author: str | None = Field(default=None, max_length=300)
    subject: str | None = Field(default=None, max_length=300)
    keywords: str | None = Field(default=None, max_length=500)


class StampRequest(BaseModel):
    text: str = Field(default="APPROVED", min_length=1, max_length=60)
    color: str = Field(default="#C0392B", pattern=r"^#[0-9a-fA-F]{6}$")
    position: str = Field(default="top-right", pattern=r"^(center|top-left|top-right|bottom-left|bottom-right)$")
    size: int = Field(default=28, ge=10, le=80)
    rotation: int = Field(default=-15, ge=-90, le=90, title="Angle (degrees)")
    pages: list[int] | None = Field(default=None, min_length=1, max_length=500)


class CompareRequest(BaseModel):
    first: str
    second: str


class TargetSizeRequest(BaseModel):
    target_mb: float = Field(default=5, gt=0, le=500, title="Smaller than (MB)")
