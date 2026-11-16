"""Route class that adds produced files to the history."""

import json
import logging
from collections.abc import Callable

from fastapi import Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.routing import APIRoute

from app.services import history


logger = logging.getLogger(__name__)


async def _source_filenames(request: Request) -> list[str]:
    """Stored upload names this request worked on."""
    for key in ("filename", "stored_filename"):
        if key in request.path_params:
            return [request.path_params[key]]

    try:
        # The endpoint already read the body, so this comes from the cache.
        body = await request.json()
    except Exception:
        return []

    names = body.get("filenames") if isinstance(body, dict) else None
    return [name for name in names or [] if isinstance(name, str)]


def _record(request: Request, response: Response, sources: list[str]) -> None:
    try:
        output = json.loads(response.body).get("output_filename")
    except (ValueError, AttributeError):
        return

    if not output:
        return

    # Endpoints that receive the file directly set the name themselves.
    source = getattr(request.state, "source_name", None) or history.source_label(
        sources
    )

    history.record_output(
        operation=request.url.path.rstrip("/").rsplit("/", 1)[-1],
        source_name=source,
        output_filename=output,
        sources=sources,
    )


class RecordedRoute(APIRoute):
    """Records every successful JSON response that names an `output_filename`."""

    def get_route_handler(self) -> Callable:
        handler = super().get_route_handler()

        async def recorded(request: Request) -> Response:
            response = await handler(request)

            if (
                response.status_code == 200
                and response.media_type == "application/json"
            ):
                try:
                    sources = await _source_filenames(request)
                    await run_in_threadpool(_record, request, response, sources)
                except Exception:
                    logger.warning("Could not record history.", exc_info=True)

            return response

        return recorded
