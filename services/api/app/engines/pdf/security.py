
from __future__ import annotations

import re
import secrets
from pathlib import Path
from uuid import uuid4

import pymupdf
from pypdf import PdfReader, PdfWriter
from pypdf.constants import UserAccessPermissions

from app.engines.pdf.errors import ENCRYPTED_PDF_MESSAGE


def _validate_pdf(path: Path) -> PdfReader:
    if not path.is_file() or path.suffix.lower() != ".pdf":
        raise FileNotFoundError("PDF file was not found.")

    reader = PdfReader(str(path), strict=False)

    if reader.is_encrypted:
        raise ValueError(ENCRYPTED_PDF_MESSAGE)

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

    # Viewers grant full rights to whoever supplies the owner password. If it
    # matched the user password, the restrictions above would never apply, so
    # an unset owner password becomes a random one nobody needs to know.
    owner = owner_password or secrets.token_urlsafe(24)

    writer = PdfWriter(clone_from=reader)
    writer.encrypt(
        user_password=user_password,
        owner_password=owner,
        permissions_flag=permissions,
        algorithm="AES-256",
    )

    return _save(writer, output)


def unlock_pdf(
    source: Path,
    output: Path,
    password: str = "",
) -> dict:
    """Remove password protection. An empty password opens PDFs that only
    carry usage restrictions (no password is needed to read them)."""
    if not source.is_file():
        raise FileNotFoundError("PDF file was not found.")

    reader = PdfReader(str(source), strict=False)
    was_encrypted = reader.is_encrypted

    if was_encrypted:
        try:
            authenticated = reader.decrypt(password)
        except Exception as exc:
            raise ValueError("Incorrect PDF password.") from exc

        if not authenticated:
            raise ValueError("Incorrect PDF password.")

    result = _save(PdfWriter(clone_from=reader), output)
    result["was_encrypted"] = was_encrypted
    result["message"] = (
        "PDF unlocked successfully."
        if was_encrypted
        else "This PDF was not password protected."
    )
    return result


def redact_pdf(
    source: Path,
    output: Path,
    regions: list[dict],
    terms: list[str] | None = None,
) -> dict:
    """Permanently remove text, images and graphics under areas and matches.

    Regions use PyMuPDF page coordinates (points, origin top-left) on the
    unrotated page, which is what the page preview shows.
    """
    _validate_pdf(source)

    terms = [term.strip() for term in terms or [] if term.strip()]

    if not regions and not terms:
        raise ValueError("Add at least one area or search term to redact.")

    document = pymupdf.open(source)

    try:
        rotations = [page.rotation for page in document]

        for page in document:
            page.set_rotation(0)

        for region in regions:
            page_number = region["page"] - 1

            if page_number < 0 or page_number >= document.page_count:
                raise ValueError("Redaction page number is out of range.")

            page = document[page_number]
            rect = pymupdf.Rect(
                region["x0"], region["y0"], region["x1"], region["y1"]
            ) & page.rect

            if rect.is_empty or rect.is_infinite:
                raise ValueError("Redaction rectangle is invalid or outside the page.")

            page.add_redact_annot(rect, fill=(0, 0, 0))

        matches = 0

        for page in document:
            for term in terms:
                for rect in page.search_for(term):
                    page.add_redact_annot(rect, fill=(0, 0, 0))
                    matches += 1

        if not regions and matches == 0:
            raise ValueError("No text matching the search terms was found.")

        for page, rotation in zip(document, rotations):
            page.apply_redactions(
                images=pymupdf.PDF_REDACT_IMAGE_PIXELS,
                graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED,
                text=pymupdf.PDF_REDACT_TEXT_REMOVE,
            )
            page.set_rotation(rotation)

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
        "areas_redacted": len(regions),
        "search_matches": matches,
    }


# Actions that run code, launch programs or move data when triggered.
_ACTIVE_ACTION = re.compile(
    r"/S\s*/(JavaScript|Launch|SubmitForm|ImportData|Rendition|Sound|Movie)|/JS\b"
)


def _object_text(document: pymupdf.Document, kind: str, value: str) -> str:
    """Text of a key's value, following one indirect reference."""
    if kind == "xref":
        return document.xref_object(int(value.split()[0]), compressed=True)

    return value


def _strip_active_content(document: pymupdf.Document) -> None:
    """Remove scripts and auto-run actions that `scrub` leaves behind."""
    catalog = document.pdf_catalog()

    document.xref_set_key(catalog, "AA", "null")

    kind, value = document.xref_get_key(catalog, "OpenAction")
    if kind != "null" and _ACTIVE_ACTION.search(_object_text(document, kind, value)):
        document.xref_set_key(catalog, "OpenAction", "null")

    kind, value = document.xref_get_key(catalog, "Names/JavaScript")
    if kind != "null":
        document.xref_set_key(catalog, "Names/JavaScript", "null")

    for page in document:
        document.xref_set_key(page.xref, "AA", "null")

        for xref, *_ in page.annot_xrefs():
            document.xref_set_key(xref, "AA", "null")

            kind, value = document.xref_get_key(xref, "A")
            if kind != "null" and _ACTIVE_ACTION.search(_object_text(document, kind, value)):
                document.xref_set_key(xref, "A", "null")


def sanitize_pdf(
    source: Path,
    output: Path,
    metadata: bool = True,
    javascript: bool = True,
    attachments: bool = True,
    annotations: bool = True,
    links: bool = True,
    hidden_text: bool = True,
    form_data: bool = True,
) -> dict:
    """Strip metadata and potentially unsafe or private elements."""
    _validate_pdf(source)

    document = pymupdf.open(source)

    try:
        report = {
            "metadata_removed": metadata
            and any(document.metadata.values()),
            "attachments_removed": document.embfile_count() if attachments else 0,
            "annotations_removed": sum(
                len(list(page.annots() or [])) for page in document
            )
            if annotations
            else 0,
            "links_removed": sum(len(page.get_links()) for page in document)
            if links
            else 0,
        }

        document.scrub(
            attached_files=attachments,
            embedded_files=attachments,
            clean_pages=True,
            hidden_text=hidden_text,
            javascript=javascript,
            metadata=metadata,
            xml_metadata=metadata,
            redactions=True,
            redact_images=2,
            remove_links=links,
            reset_fields=form_data,
            reset_responses=annotations,
            thumbnails=True,
        )

        if javascript:
            _strip_active_content(document)

        if annotations:
            for page in document:
                for annotation in list(page.annots() or []):
                    page.delete_annot(annotation)

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
        **report,
    }
