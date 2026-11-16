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


class TargetSizeRequest(BaseModel):
    target_mb: float = Field(default=5, gt=0, le=500, title="Smaller than (MB)")
