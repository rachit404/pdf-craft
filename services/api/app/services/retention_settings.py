"""Retention period, read in one place so every module agrees."""

import os


def hours() -> float:
    try:
        return float(os.getenv("PDF_CRAFT_RETENTION_HOURS", "24"))
    except ValueError:
        return 24.0
