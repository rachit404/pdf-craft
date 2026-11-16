from fastapi import APIRouter

from app import registry


router = APIRouter(prefix="/registry", tags=["Registry"])


@router.get("/operations")
def list_operations() -> list[dict]:
    """Every tool with its inputs, output and a JSON Schema of its settings."""
    return [operation.describe() for operation in registry.all_operations()]
