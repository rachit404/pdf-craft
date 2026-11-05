
from pydantic import BaseModel, Field, model_validator


class ProtectPDFRequest(BaseModel):
    user_password: str = Field(min_length=1, max_length=128)
    owner_password: str | None = Field(default=None, max_length=128)
    allow_printing: bool = True
    allow_copying: bool = False
    allow_modifying: bool = False
    allow_annotations: bool = False


class UnlockPDFRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class RedactionRegion(BaseModel):
    page: int = Field(ge=1)
    x0: float
    y0: float
    x1: float
    y1: float

    @model_validator(mode="after")
    def validate_coordinates(self):
        if self.x1 <= self.x0 or self.y1 <= self.y0:
            raise ValueError("Redaction coordinates must define a positive rectangle.")
        return self


class RedactPDFRequest(BaseModel):
    regions: list[RedactionRegion] = Field(min_length=1, max_length=500)
