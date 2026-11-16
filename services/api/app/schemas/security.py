
from pydantic import BaseModel, Field, model_validator


class ProtectPDFRequest(BaseModel):
    user_password: str = Field(min_length=1, max_length=128)
    owner_password: str | None = Field(default=None, max_length=128)
    allow_printing: bool = True
    allow_copying: bool = False
    allow_modifying: bool = False
    allow_annotations: bool = False


class UnlockPDFRequest(BaseModel):
    # Empty is valid: PDFs with only usage restrictions open without a password.
    password: str = Field(default="", max_length=128)


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
    regions: list[RedactionRegion] = Field(default_factory=list, max_length=500)
    terms: list[str] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def require_target(self):
        self.terms = [term.strip() for term in self.terms if term.strip()]

        if not self.regions and not self.terms:
            raise ValueError("Provide at least one area or search term to redact.")

        if any(len(term) > 100 for term in self.terms):
            raise ValueError("Search terms are limited to 100 characters.")

        return self


class SanitizePDFRequest(BaseModel):
    metadata: bool = True
    javascript: bool = True
    attachments: bool = True
    annotations: bool = True
    links: bool = True
    hidden_text: bool = True
    form_data: bool = True
