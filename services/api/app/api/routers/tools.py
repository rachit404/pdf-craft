"""Power tools: blank pages, forms, document details and size targets."""

from fastapi import APIRouter, HTTPException

from app.api.recording import RecordedRoute
from app.api.routers.uploads import resolve_stored_file
from app.schemas.tools import BlankPagesRequest, FillFormRequest, MetadataRequest, TargetSizeRequest
from app.services import power_service


router = APIRouter(prefix="/tools", tags=["Power tools"], route_class=RecordedRoute)


def _execute(function, *args, **kwargs):
    try:
        return function(*args, **kwargs)
    except FileNotFoundError as error:
        raise HTTPException(404, str(error)) from error
    except (ValueError, OSError) as error:
        raise HTTPException(422, str(error)) from error


@router.post("/{filename}/remove-blank-pages")
def remove_blank_pages(filename: str, request: BlankPagesRequest):
    return _execute(power_service.remove_blank_pages, resolve_stored_file(filename), request.ink_percent)


@router.post("/{filename}/flatten-forms")
def flatten_forms(filename: str):
    return _execute(power_service.flatten_forms, resolve_stored_file(filename))


@router.get("/{filename}/form-fields")
def form_fields(filename: str):
    return _execute(power_service.form_fields, resolve_stored_file(filename))


@router.post("/{filename}/fill-form")
def fill_form(filename: str, request: FillFormRequest):
    return _execute(power_service.fill_form, resolve_stored_file(filename), request.values, request.flatten)


@router.post("/{filename}/edit-metadata")
def edit_metadata(filename: str, request: MetadataRequest):
    return _execute(power_service.edit_metadata, resolve_stored_file(filename), request.model_dump())


@router.post("/{filename}/compress-to-target")
def compress_to_target(filename: str, request: TargetSizeRequest):
    return _execute(power_service.compress_to_target, resolve_stored_file(filename), request.target_mb)
