
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routers.health import router as health_router
from app.api.routers.jobs import router as jobs_router
from app.api.routers.outputs import router as outputs_router
from app.api.routers.uploads import router as uploads_router
from app.api.routers.operations import router as operations_router
from app.api.routers.conversions import router as conversions_router
from app.api.routers.security import router as security_router
from app.db.init_db import create_schema
from app.services import retention


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_schema()
    cleanup = asyncio.create_task(retention.run_forever())

    try:
        yield
    finally:
        cleanup.cancel()


app = FastAPI(
    lifespan=lifespan,
    title="PDF Craft API",
    description="Local-first PDF processing and conversion service.",
    version="0.2.0",
)

app.include_router(health_router)
app.include_router(jobs_router)
app.include_router(uploads_router)
app.include_router(outputs_router)
app.include_router(operations_router)
app.include_router(conversions_router)
app.include_router(security_router)
