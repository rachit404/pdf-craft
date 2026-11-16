"""Settings read from environment variables.

Every variable is optional; the defaults suit local development.

PDF_CRAFT_MAX_UPLOAD_MB   largest PDF or Word/PowerPoint upload (25)
PDF_CRAFT_MAX_IMAGE_MB    largest image upload (10)
"""

import os


def _megabytes(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, default))
    except ValueError:
        value = default

    return max(value, 1) * 1024 * 1024


MAX_UPLOAD_BYTES = _megabytes("PDF_CRAFT_MAX_UPLOAD_MB", 25)
MAX_IMAGE_BYTES = _megabytes("PDF_CRAFT_MAX_IMAGE_MB", 10)
