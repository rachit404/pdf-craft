
from fastapi import APIRouter, HTTPException, status

from app.api.routers.uploads import resolve_stored_file
from app.schemas.operations import (
    AddImageRequest,
    AddTextRequest,
    BackgroundRequest,
    CropRequest,
    HeaderFooterRequest,
    MergeRequest,
    PageNumberRequest,
    PagesRequest,
    ReorderRequest,
    RotateRequest,
    SplitRequest,
    WatermarkRequest,
)
from app.services import pdf_service
from app.storage import UPLOAD_DIR, sanitize_filename


router = APIRouter(prefix="/operations", tags=["PDF Operations"])


def _execute(function, *args, **kwargs):
    try:
        return function(*args, **kwargs)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/merge")
def merge(request: MergeRequest):
    paths = [resolve_stored_file(name) for name in request.filenames]
    return _execute(pdf_service.merge_documents, paths)


@router.post("/{filename}/extract-pages")
def extract_pages(filename: str, request: PagesRequest):
    return _execute(pdf_service.extract_document_pages, resolve_stored_file(filename), request.pages)


@router.post("/{filename}/reorder-pages")
def reorder_pages(filename: str, request: ReorderRequest):
    return _execute(pdf_service.reorder_document_pages, resolve_stored_file(filename), request.order)


@router.post("/{filename}/delete-pages")
def delete_pages(filename: str, request: PagesRequest):
    return _execute(pdf_service.delete_document_pages, resolve_stored_file(filename), request.pages)


@router.post("/{filename}/duplicate-pages")
def duplicate_pages(filename: str, request: PagesRequest):
    return _execute(pdf_service.duplicate_document_pages, resolve_stored_file(filename), request.pages)


@router.post("/{filename}/rotate")
def rotate(filename: str, request: RotateRequest):
    return _execute(pdf_service.rotate_document_pages, resolve_stored_file(filename), request.pages, request.degrees)


@router.post("/{filename}/split")
def split(filename: str, request: SplitRequest):
    return _execute(pdf_service.split_document, resolve_stored_file(filename), request.ranges)


@router.post("/{filename}/watermark")
def watermark(filename: str, request: WatermarkRequest):
    return _execute(pdf_service.watermark_document, resolve_stored_file(filename), request.text, request.opacity, request.font_size)


@router.post("/{filename}/page-numbers")
def page_numbers(filename: str, request: PageNumberRequest):
    return _execute(pdf_service.number_document_pages, resolve_stored_file(filename), request.position, request.font_size)


@router.post("/{filename}/header-footer")
def header_footer(filename: str, request: HeaderFooterRequest):
    return _execute(pdf_service.header_footer_document, resolve_stored_file(filename), request.header, request.footer)


@router.post("/{filename}/background")
def background(filename: str, request: BackgroundRequest):
    return _execute(pdf_service.background_document, resolve_stored_file(filename), request.red, request.green, request.blue)


@router.post("/{filename}/crop")
def crop(filename: str, request: CropRequest):
    return _execute(pdf_service.crop_document, resolve_stored_file(filename), request.left, request.bottom, request.right, request.top)


@router.post("/{filename}/add-text")
def add_text(filename: str, request: AddTextRequest):
    return _execute(pdf_service.text_document, resolve_stored_file(filename), request.text, request.x, request.y, request.font_size)


@router.post("/{filename}/add-image")
def add_image(filename: str, request: AddImageRequest):
    try:
        image_name = sanitize_filename(request.image_filename)
        if image_name != request.image_filename:
            raise ValueError("Invalid image filename.")
        image_path = (UPLOAD_DIR / image_name).resolve()
        if image_path.parent != UPLOAD_DIR.resolve() or not image_path.is_file():
            raise FileNotFoundError("Uploaded image was not found.")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _execute(
        pdf_service.image_document,
        resolve_stored_file(filename),
        image_path,
        request.x,
        request.y,
        request.width,
        request.height,
    )
