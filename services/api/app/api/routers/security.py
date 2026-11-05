
from fastapi import APIRouter, HTTPException

from app.api.routers.uploads import resolve_stored_file
from app.schemas.security import (
    ProtectPDFRequest,
    RedactPDFRequest,
    UnlockPDFRequest,
)
from app.services import security_service


router = APIRouter(prefix="/security", tags=["PDF Security"])


def _execute(function, *args, **kwargs):
    try:
        return function(*args, **kwargs)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            422,
            "PDF security operation failed. Check the input document.",
        ) from exc


@router.post("/{filename}/protect")
def protect(filename: str, request: ProtectPDFRequest):
    return _execute(
        security_service.protect_document,
        resolve_stored_file(filename),
        user_password=request.user_password,
        owner_password=request.owner_password,
        allow_printing=request.allow_printing,
        allow_copying=request.allow_copying,
        allow_modifying=request.allow_modifying,
        allow_annotations=request.allow_annotations,
    )


@router.post("/{filename}/unlock")
def unlock(filename: str, request: UnlockPDFRequest):
    return _execute(
        security_service.unlock_document,
        resolve_stored_file(filename),
        request.password,
    )


@router.post("/{filename}/redact")
def redact(filename: str, request: RedactPDFRequest):
    regions = [region.model_dump() for region in request.regions]

    return _execute(
        security_service.redact_document,
        resolve_stored_file(filename),
        regions,
    )


@router.post("/{filename}/sanitize")
def sanitize(filename: str):
    return _execute(
        security_service.sanitize_document,
        resolve_stored_file(filename),
    )
