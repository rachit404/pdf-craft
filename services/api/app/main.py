from fastapi import FastAPI

app = FastAPI(
    title="PDF Craft API",
    version="0.1.0",
    description="Locally hosted PDF processing API",
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "pdf-craft-api",
    }