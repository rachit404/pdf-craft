from datetime import datetime

from pydantic import BaseModel


class StoredFileResponse(BaseModel):
    name: str
    kind: str
    original_name: str
    size_bytes: int
    parent_name: str | None
    root_name: str
    sources: list[str]
    operation: str | None
    intermediate: bool
    created_at: datetime
    # None when files are kept until deleted by hand.
    expires_at: datetime | None
    # False once the file itself has been deleted.
    available: bool
