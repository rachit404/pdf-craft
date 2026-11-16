"""The catalogue of operations.

Every tool is declared once here: what it is called, what it accepts, what it
produces and which settings it takes. The flow engine runs operations from this
catalogue and the web app builds its menus and option forms from it.
"""

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel


@dataclass(frozen=True)
class Port:
    """One input of an operation."""

    name: str
    kind: str  # pdf, image, docx, pptx
    many: bool = False  # accepts several files at once
    label: str = ""


@dataclass(frozen=True)
class Operation:
    id: str
    label: str
    category: str
    description: str
    inputs: tuple[Port, ...]
    output: str  # kind of every file it produces
    params: type[BaseModel]
    # run(files by port name, settings) -> the files it produced
    run: Callable[[dict[str, list[Path]], BaseModel], list[Path]]
    many_outputs: bool = False
    # "each": once per file arriving on the first input.
    # "combine": once, with every file that arrived (merge).
    mode: str = "each"

    def describe(self) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "category": self.category,
            "description": self.description,
            "inputs": [
                {
                    "name": port.name,
                    "kind": port.kind,
                    "many": port.many,
                    "label": port.label or port.name,
                }
                for port in self.inputs
            ],
            "output": self.output,
            "many_outputs": self.many_outputs,
            "mode": self.mode,
            "params_schema": self.params.model_json_schema(),
        }


OPERATIONS: dict[str, Operation] = {}


def register(operation: Operation) -> Operation:
    if operation.id in OPERATIONS:
        raise ValueError(f"Operation {operation.id!r} is registered twice.")

    OPERATIONS[operation.id] = operation
    return operation


def get(operation_id: str) -> Operation | None:
    _load()
    return OPERATIONS.get(operation_id)


def all_operations() -> list[Operation]:
    _load()
    return list(OPERATIONS.values())


def _load() -> None:
    # Imported on first use: the operations import the services, which import
    # this package.
    if not OPERATIONS:
        from app.registry import operations  # noqa: F401
