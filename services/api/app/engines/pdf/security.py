
from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pymupdf
from pypdf import PdfReader, PdfWriter
from pypdf.constants import UserAccessPermissions


def _validate_pdf(path: Path) -> PdfReader:
    if not path.is_file() or path.suffix.lower() != ".pdf":
        raise FileNotFoundError("PDF file was not found.")

    reader = PdfReader(str(path), strict=False)

    if reader.is_encrypted:
        raise ValueError("PDF is encrypted. Supply its password first.")

    if len(reader.pages) == 0:
        raise ValueError("PDF contains no pages.")

    return reader


def _save(writer: PdfWriter, output: Path) -> dict:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{uuid4().hex}.tmp")

    try:
        with temporary.open("wb") as file:
            writer.write(file)

        if not temporary.is_file() or temporary.stat().st_size == 0:
            raise ValueError("PDF processing produced an empty file.")

        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)

    return {
        "output_filename": output.name,
        "output_size_bytes": output.stat().st_size,
    }


def protect_pdf(
    source: Path,
    output: Path,
    user_password: str,
    owner_password: str | None,
    allow_printing: bool,
    allow_copying: bool,
    allow_modifying: bool,
    allow_annotations: bool,
) -> dict:
    reader = _validate_pdf(source)

    if not user_password:
        raise ValueError("A user password is required.")

    permissions = UserAccessPermissions(0)

    if allow_printing:
        permissions |= UserAccessPermissions.PRINT
    if allow_copying:
        permissions |= UserAccessPermissions.EXTRACT
    if allow_modifying:
        permissions |= UserAccessPermissions.MODIFY
    if allow_annotations:
        permissions |= UserAccessPermissions.ADD_OR_MODIFY

    writer = PdfWriter()
    writer.append(reader)
    writer.encrypt(
        user_password=user_password,
        owner_password=owner_password or None,
        permissions_flag=permissions,
        algorithm="AES-256",
    )

    return _save(writer, output)


def unlock_pdf(
    source: Path,
    output: Path,
    password: str,
) -> dict:
    if not source.is_file():
        raise FileNotFoundError("PDF file was not found.")

    reader = PdfReader(str(source), strict=False)

    if reader.is_encrypted:
        try:
            authenticated = reader.decrypt(password)
        except Exception as exc:
            raise ValueError("Incorrect PDF password.") from exc

        if not authenticated:
            raise ValueError("Incorrect PDF password.")

    writer = PdfWriter()
    writer.append(reader)

    result = _save(writer, output)
    result["message"] = "PDF unlocked successfully."
    return result


def redact_pdf(
    source: Path,
    output: Path,
    regions: list[dict],
) -> dict:
    _validate_pdf(source)

    if not regions:
        raise ValueError("At least one redaction region is required.")

    document = pymupdf.open(source)

    try:
        for region in regions:
            page_number = region["page"] - 1

            if page_number < 0 or page_number >= document.page_count:
                raise ValueError("Redaction page number is out of range.")

            page = document[page_number]
            rect = pymupdf.Rect(
                region["x0"],
                region["y0"],
                region["x1"],
                region["y1"],
            )

            if rect.is_empty or rect.is_infinite or not page.rect.contains(rect):
                raise ValueError("Redaction rectangle is invalid or outside the page.")

            page.add_redact_annot(rect, fill=(0, 0, 0))

        for page in document:
            page.apply_redactions(
                images=pymupdf.PDF_REDACT_IMAGE_PIXELS,
                graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED,
                text=pymupdf.PDF_REDACT_TEXT_REMOVE,
            )

        output.parent.mkdir(parents=True, exist_ok=True)
        document.save(
            output,
            garbage=4,
            deflate=True,
            clean=True,
        )
    finally:
        document.close()

    return {
        "output_filename": output.name,
        "output_size_bytes": output.stat().st_size,
        "message": "Redactions applied permanently.",
    }


def sanitize_pdf(source: Path, output: Path) -> dict:
    _validate_pdf(source)

    document = pymupdf.open(source)

    try:
        document.scrub(
            attached_files=True,
            clean_pages=True,
            embedded_files=True,
            hidden_text=True,
            javascript=True,
            metadata=True,
            redactions=True,
            reset_fields=True,
            reset_responses=True,
            thumbnails=True,
            xml_metadata=True,
        )

        # Remove remaining page annotations and links.
        for page in document:
            annotations = list(page.annots() or [])
            for annotation in annotations:
                page.delete_annot(annotation)

            links = page.get_links()
            for link in links:
                page.delete_link(link)

        output.parent.mkdir(parents=True, exist_ok=True)
        document.save(
            output,
            garbage=4,
            deflate=True,
            clean=True,
        )
    finally:
        document.close()

    return {
        "output_filename": output.name,
        "output_size_bytes": output.stat().st_size,
        "message": "PDF sanitization completed.",
    }
