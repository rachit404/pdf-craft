from fastapi import FastAPI

from app.api.routers.health import router as health_router
from app.api.routers.jobs import router as jobs_router
from app.api.routers.outputs import router as outputs_router
from app.api.routers.uploads import router as uploads_router
from app.api.routers.operations import router as operations_router


app = FastAPI(
    title="PDF Craft API",
    description="Local-first PDF processing service.",
    version="0.1.0",
)

app.include_router(health_router)
app.include_router(jobs_router)
app.include_router(uploads_router)
app.include_router(outputs_router)
app.include_router(operations_router)