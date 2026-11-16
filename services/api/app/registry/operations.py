"""Declarations of every operation, each wrapping an existing service."""

import zipfile
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, Field

from app.registry import Operation, Port, register
from app.schemas.conversions import PDFToImagesRequest, PDFToPPTXRequest
from app.schemas.operations import (
    AddTextRequest,
    BackgroundRequest,
    CropRequest,
    HeaderFooterRequest,
    PageNumberRequest,
    PagesRequest,
    ReorderRequest,
    RotateRequest,
    SplitRequest,
    WatermarkRequest,
)
from app.schemas.security import (
    ProtectPDFRequest,
    RedactPDFRequest,
    SanitizePDFRequest,
    UnlockPDFRequest,
)
from app.schemas.tools import (
    AnnotateRequest,
    BlankPagesRequest,
    DeskewRequest,
    FillFormRequest,
    MetadataRequest,
    StampRequest,
    TargetSizeRequest,
)
from app.schemas.uploads import CompressRequest
from app.services import conversion_service, pdf_service, power_service, security_service

MAX_UNZIPPED_FILES = 200


class NoSettings(BaseModel):
    """For operations that need no settings."""


class AddImageSettings(BaseModel):
    x: float
    y: float
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    pages: list[int] | None = Field(default=None, min_length=1, max_length=500)


# ---------------------------------------------------------
# Helpers: turn a service result into the files it produced
# ---------------------------------------------------------

def _pdf_result(result: dict) -> list[Path]:
    return [pdf_service.OUTPUT_DIR / result["output_filename"]]


def _security_result(result: dict) -> list[Path]:
    return [security_service.OUTPUT_DIR / result["output_filename"]]


def _conversion_result(result: dict) -> list[Path]:
    return [conversion_service.OUTPUT_DIR / result["output_filename"]]


def _unzip(archive: Path, extensions: tuple[str, ...], folder: Path) -> list[Path]:
    """Spread the files of a result ZIP out as separate stored files."""
    produced: list[Path] = []

    try:
        with zipfile.ZipFile(archive) as bundle:
            members = sorted(
                (
                    item for item in bundle.infolist()
                    if not item.is_dir() and item.filename.lower().endswith(extensions)
                ),
                key=lambda item: item.filename,
            )

            if len(members) > MAX_UNZIPPED_FILES:
                raise ValueError(f"The result has more than {MAX_UNZIPPED_FILES} files.")

            for member in members:
                target = folder / f"{uuid4().hex}{Path(member.filename).suffix.lower()}"
                target.write_bytes(bundle.read(member))
                produced.append(target)
    finally:
        archive.unlink(missing_ok=True)

    return produced


def _pdf_operation(
    id: str,
    label: str,
    category: str,
    description: str,
    params: type[BaseModel],
    call,
    *,
    output: str = "pdf",
    many_outputs: bool = False,
) -> None:
    """An operation with one PDF input."""
    register(
        Operation(
            id=id,
            label=label,
            category=category,
            description=description,
            inputs=(Port("pdf", "pdf", label="PDF"),),
            output=output,
            params=params,
            run=lambda files, settings: call(files["pdf"][0], settings),
            many_outputs=many_outputs,
        )
    )


# ---------------------------------------------------------
# Pages
# ---------------------------------------------------------

register(
    Operation(
        id="merge",
        label="Merge",
        category="Pages",
        description="Combine several PDFs into one, in order.",
        inputs=(Port("pdf", "pdf", many=True, label="PDFs"),),
        output="pdf",
        params=NoSettings,
        run=lambda files, settings: _pdf_result(pdf_service.merge_documents(files["pdf"])),
        mode="combine",
    )
)


def _split(path: Path, settings: SplitRequest) -> list[Path]:
    result = pdf_service.split_document(path, settings.ranges)
    return _unzip(pdf_service.OUTPUT_DIR / result["output_filename"], (".pdf",), pdf_service.OUTPUT_DIR)


_pdf_operation("split", "Split", "Pages", "Cut a PDF into several PDFs by page ranges.", SplitRequest, _split, many_outputs=True)
_pdf_operation("extract_pages", "Extract pages", "Pages", "Keep only the chosen pages.", PagesRequest, lambda f, p: _pdf_result(pdf_service.extract_document_pages(f, p.pages)))
_pdf_operation("reorder_pages", "Reorder pages", "Pages", "Put the pages in a new order.", ReorderRequest, lambda f, p: _pdf_result(pdf_service.reorder_document_pages(f, p.order)))
_pdf_operation("delete_pages", "Delete pages", "Pages", "Remove the chosen pages.", PagesRequest, lambda f, p: _pdf_result(pdf_service.delete_document_pages(f, p.pages)))
_pdf_operation("duplicate_pages", "Duplicate pages", "Pages", "Copy pages; each copy follows its original.", PagesRequest, lambda f, p: _pdf_result(pdf_service.duplicate_document_pages(f, p.pages)))
_pdf_operation("rotate", "Rotate", "Pages", "Turn pages by 90, 180 or 270 degrees.", RotateRequest, lambda f, p: _pdf_result(pdf_service.rotate_document_pages(f, p.pages, p.degrees)))

# ---------------------------------------------------------
# Add to pages
# ---------------------------------------------------------

_pdf_operation("watermark", "Watermark", "Add to pages", "Stamp diagonal text on every page.", WatermarkRequest, lambda f, p: _pdf_result(pdf_service.watermark_document(f, p.text, p.opacity, p.font_size)))
_pdf_operation("page_numbers", "Page numbers", "Add to pages", "Number the pages.", PageNumberRequest, lambda f, p: _pdf_result(pdf_service.number_document_pages(f, p.position, p.font_size)))
_pdf_operation("header_footer", "Header and footer", "Add to pages", "Add a header and a footer.", HeaderFooterRequest, lambda f, p: _pdf_result(pdf_service.header_footer_document(f, p.header, p.footer)))
_pdf_operation("background", "Background", "Add to pages", "Fill the pages with a colour behind the content.", BackgroundRequest, lambda f, p: _pdf_result(pdf_service.background_document(f, p.red, p.green, p.blue)))
_pdf_operation("crop", "Crop", "Add to pages", "Trim margins from every page.", CropRequest, lambda f, p: _pdf_result(pdf_service.crop_document(f, p.left, p.bottom, p.right, p.top)))
_pdf_operation("add_text", "Add text", "Add to pages", "Place text at a position.", AddTextRequest, lambda f, p: _pdf_result(pdf_service.text_document(f, p.text, p.x, p.y, p.font_size, p.color, p.pages)))

register(
    Operation(
        id="add_image",
        label="Add image",
        category="Add to pages",
        description="Place a PNG or JPEG on the pages.",
        inputs=(Port("pdf", "pdf", label="PDF"), Port("image", "image", label="Image")),
        output="pdf",
        params=AddImageSettings,
        run=lambda files, s: _pdf_result(
            pdf_service.image_document(files["pdf"][0], files["image"][0], s.x, s.y, s.width, s.height, s.pages)
        ),
    )
)

# ---------------------------------------------------------
# Optimize and protect
# ---------------------------------------------------------

_pdf_operation("compress", "Make smaller", "Optimize", "Shrink the file. Lossless keeps every pixel.", CompressRequest, lambda f, p: _pdf_result(pdf_service.compress_document(f, p.level)))
_pdf_operation("protect", "Password", "Protect", "Lock the file with a password (AES-256).", ProtectPDFRequest, lambda f, p: _security_result(security_service.protect_document(
    f,
    user_password=p.user_password,
    owner_password=p.owner_password,
    allow_printing=p.allow_printing,
    allow_copying=p.allow_copying,
    allow_modifying=p.allow_modifying,
    allow_annotations=p.allow_annotations,
)))
_pdf_operation("unlock", "Unlock", "Protect", "Remove password protection.", UnlockPDFRequest, lambda f, p: _security_result(security_service.unlock_document(f, p.password)))
_pdf_operation("redact", "Redact", "Protect", "Permanently remove areas or words.", RedactPDFRequest, lambda f, p: _security_result(security_service.redact_document(f, [r.model_dump() for r in p.regions], p.terms)))
_pdf_operation("sanitize", "Clean", "Protect", "Remove metadata, scripts and hidden data.", SanitizePDFRequest, lambda f, p: _security_result(security_service.sanitize_document(f, **p.model_dump())))

# ---------------------------------------------------------
# Power tools
# ---------------------------------------------------------

def _split_at_blanks(path: Path, settings: BlankPagesRequest) -> list[Path]:
    return _split(path, SplitRequest(ranges=power_service.blank_page_ranges(path, settings.ink_percent)))


_pdf_operation("remove_blank_pages", "Remove blank pages", "Clean", "Drop pages with nothing on them, such as the backs of scanned sheets.", BlankPagesRequest, lambda f, p: _pdf_result(power_service.remove_blank_pages(f, p.ink_percent)))
_pdf_operation("split_at_blanks", "Split at blank pages", "Pages", "Cut a stack of scanned documents apart wherever a blank page separates them.", BlankPagesRequest, _split_at_blanks, many_outputs=True)
_pdf_operation("flatten_forms", "Flatten forms", "Forms", "Turn form fields into plain page content so they can no longer be changed.", NoSettings, lambda f, p: _pdf_result(power_service.flatten_forms(f)))
_pdf_operation("fill_form", "Fill form", "Forms", "Fill in form fields by name, and optionally flatten them.", FillFormRequest, lambda f, p: _pdf_result(power_service.fill_form(f, p.values, p.flatten)))
_pdf_operation("edit_metadata", "Document details", "Clean", "Set the title, author, subject and keywords.", MetadataRequest, lambda f, p: _pdf_result(power_service.edit_metadata(f, p.model_dump())))
_pdf_operation("annotate", "Highlight and note", "Add to pages", "Highlight words everywhere, or add marks and notes as real PDF annotations.", AnnotateRequest, lambda f, p: _pdf_result(power_service.annotate(f, [m.model_dump() for m in p.marks], p.terms)))
_pdf_operation("deskew", "Straighten scans", "Clean", "Level tilted scanned pages. Pages with real text are left alone.", DeskewRequest, lambda f, p: _pdf_result(power_service.deskew(f, p.max_angle)))
_pdf_operation("stamp", "Stamp", "Add to pages", "A bordered label such as APPROVED or CONFIDENTIAL.", StampRequest, lambda f, p: _pdf_result(power_service.stamp(f, **p.model_dump())))
_pdf_operation("to_grayscale", "Greyscale", "Clean", "Turn colours and images grey; text stays text.", NoSettings, lambda f, p: _pdf_result(power_service.to_grayscale(f)))
_pdf_operation("compress_to_target", "Make smaller than a size", "Optimize", "Try gentler levels first and stop at the first that fits the size.", TargetSizeRequest, lambda f, p: _pdf_result(power_service.compress_to_target(f, p.target_mb)))

# ---------------------------------------------------------
# Convert
# ---------------------------------------------------------

def _to_images(path: Path, settings: PDFToImagesRequest) -> list[Path]:
    result = conversion_service.pdf_to_images(path, settings.image_format, settings.dpi)
    return _unzip(
        conversion_service.OUTPUT_DIR / result["output_filename"],
        (".png", ".jpg", ".jpeg"),
        conversion_service.OUTPUT_DIR,
    )


_pdf_operation("to_images", "To images", "Convert", "One PNG or JPEG per page.", PDFToImagesRequest, _to_images, output="image", many_outputs=True)
_pdf_operation("to_docx", "To Word", "Convert", "Editable Word document (best effort).", NoSettings, lambda f, p: _conversion_result(conversion_service.pdf_to_docx(f)), output="docx")
_pdf_operation("to_xlsx", "To Excel", "Convert", "Tables as an Excel workbook.", NoSettings, lambda f, p: _conversion_result(conversion_service.pdf_to_xlsx(f)), output="xlsx")
_pdf_operation("to_pptx", "To PowerPoint", "Convert", "One slide per page.", PDFToPPTXRequest, lambda f, p: _conversion_result(conversion_service.pdf_to_pptx(f, p.dpi)), output="pptx")

register(
    Operation(
        id="images_to_pdf",
        label="Images to PDF",
        category="Convert",
        description="One page per image, in order.",
        inputs=(Port("image", "image", many=True, label="Images"),),
        output="pdf",
        params=NoSettings,
        run=lambda files, settings: _conversion_result(conversion_service.images_to_pdf(files["image"])),
        mode="combine",
    )
)

for _kind, _label, _call in (
    ("docx", "Word to PDF", conversion_service.docx_to_pdf),
    ("pptx", "PowerPoint to PDF", conversion_service.pptx_to_pdf),
):
    register(
        Operation(
            id=f"{_kind}_to_pdf",
            label=_label,
            category="Convert",
            description=f"Convert a {_kind.upper()} file to PDF.",
            inputs=(Port(_kind, _kind, label=_kind.upper()),),
            output="pdf",
            params=NoSettings,
            run=lambda files, settings, kind=_kind, call=_call: _conversion_result(call(files[kind][0])),
        )
    )
