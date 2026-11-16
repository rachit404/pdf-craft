
import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI

from app.api.routers.health import router as health_router
from app.api.routers.jobs import router as jobs_router
from app.api.routers.outputs import router as outputs_router
from app.api.routers.uploads import router as uploads_router
from app.api.routers.operations import router as operations_router
from app.api.routers.conversions import router as conversions_router
from app.api.routers.security import router as security_router
from app import auth
from app.db.init_db import create_schema
from app.services import retention


@asynccontextmanager
async def lifespan(_: FastAPI):
    auth.validate_config()
    create_schema()
    cleanup = asyncio.create_task(retention.run_forever())

    try:
        yield
    finally:
        cleanup.cancel()


# With sign-in enabled, do not publish the API schema to anonymous visitors.
_hidden_docs = (
    {"docs_url": None, "redoc_url": None, "openapi_url": None}
    if auth.auth_enabled()
    else {}
)

app = FastAPI(
    lifespan=lifespan,
    title="PDF Craft API",
    description="Local-first PDF processing and conversion service.",
    version="1.0.0",
    **_hidden_docs,
)

app.include_router(health_router)
app.include_router(auth.router)

for router in (
    jobs_router,
    uploads_router,
    outputs_router,
    operations_router,
    conversions_router,
    security_router,
):
    app.include_router(router, dependencies=[Depends(auth.require_auth)])
