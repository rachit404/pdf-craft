"""Runs a flow.

Files ("items") travel between steps as lists. A step either runs once for each
file that reaches it, or once for all of them (merge, images to PDF). Every
result is stored as a normal file with its lineage, so the finished files can be
opened, downloaded or used in further work.
"""

import logging
import os
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from app import registry
from app.flows import cache
from app.flows.definition import (
    OUTPUT,
    SOURCE,
    FlowDefinition,
    port_for,
    topological_order,
    validate,
)
from app.services import file_store


logger = logging.getLogger(__name__)

MAX_ITEMS_PER_STEP = int(os.getenv("PDF_CRAFT_FLOW_MAX_ITEMS", "50"))
MAX_TOTAL_FILES = 200


def time_limit() -> float:
    try:
        return float(os.getenv("PDF_CRAFT_FLOW_TIMEOUT", "600"))
    except ValueError:
        return 600.0


class FlowError(ValueError):
    """The flow cannot run as defined, or a step failed."""


@dataclass
class Item:
    path: Path
    kind: str

    @property
    def name(self) -> str:
        return self.path.name


@dataclass
class RunResult:
    status: str  # done, failed or cancelled
    node_states: dict[str, dict]
    outputs: list[str]
    error: str | None = None


def _state(status: str, **extra) -> dict:
    return {"status": status, **extra}


def run_flow(
    definition: FlowDefinition,
    inputs: dict[str, list[str]],
    *,
    owner: str = file_store.DEFAULT_OWNER,
    progress: Callable[[dict[str, dict]], None] | None = None,
    cancelled: Callable[[], bool] = lambda: False,
) -> RunResult:
    issues = validate(definition)

    if issues:
        raise FlowError("; ".join(issue.message for issue in issues[:3]))

    nodes = {node.id: node for node in definition.nodes}
    order = topological_order(definition) or []
    states = {node_id: _state("pending") for node_id in order}
    items: dict[str, list[Item]] = {}
    created: dict[str, list[str]] = {}  # step id -> names of the files it made
    produced = 0
    deadline = time.monotonic() + time_limit()

    def publish() -> None:
        if progress:
            progress(states)

    def fail(node_id: str, message: str) -> None:
        states[node_id] = _state("error", error=message)

    for node_id in order:
        node = nodes[node_id]

        if cancelled():
            for pending in order:
                if states[pending]["status"] == "pending":
                    states[pending] = _state("cancelled")
            publish()
            return RunResult("cancelled", states, [], "The run was cancelled.")

        if time.monotonic() > deadline:
            fail(node_id, "The run exceeded its time limit.")
            break

        incoming_edges = [edge for edge in definition.edges if edge.target == node_id]

        if any(states[edge.source]["status"] != "done" for edge in incoming_edges):
            states[node_id] = _state("skipped")
            publish()
            continue

        reused: list[Path] | None = None
        started = time.monotonic()
        states[node_id] = _state("running")
        publish()

        try:
            if node.op == SOURCE:
                items[node_id] = _source_items(node_id, inputs.get(node_id, []))

            elif node.op == OUTPUT:
                items[node_id] = [item for edge in incoming_edges for item in items[edge.source]]

            else:
                operation = registry.get(node.op)
                assert operation is not None  # checked by validate()
                settings = operation.params.model_validate(node.params)
                by_port: dict[str, list[Item]] = {port.name: [] for port in operation.inputs}

                for edge in incoming_edges:
                    by_port[port_for(edge, operation)].extend(items[edge.source])

                step_key = cache.key_for(
                    operation.id,
                    settings.model_dump_json(),
                    {name: [item.path for item in port_items] for name, port_items in by_port.items()},
                )
                reused = cache.lookup(step_key) if step_key else None
                made = reused if reused is not None else _run_operation(operation, settings, by_port, deadline, cancelled)

                if reused is None and step_key and not cancelled():
                    cache.store(step_key, made)

                produced += len(made)

                if produced > MAX_TOTAL_FILES:
                    raise FlowError(f"The flow made more than {MAX_TOTAL_FILES} files.")

                main = [item.name for item in by_port[operation.inputs[0].name]]
                names = [path.name for path in made]

                for name in [] if reused is not None else names:
                    file_store.register(
                        name,
                        kind=operation.output,
                        operation=operation.id,
                        sources=main[:1] if operation.mode == "each" else main,
                        intermediate=True,
                        owner=owner,
                    )

                items[node_id] = [Item(path, operation.output) for path in made]
                created[node_id] = names

            if len(items[node_id]) > MAX_ITEMS_PER_STEP:
                raise FlowError(f"This step received more than {MAX_ITEMS_PER_STEP} files.")

            states[node_id] = _state(
                "done",
                duration=round(time.monotonic() - started, 3),
                items=[item.name for item in items[node_id]],
                **({"cached": True} if reused is not None else {}),
            )
        except (ValueError, FileNotFoundError) as error:
            fail(node_id, str(error) or "This step failed.")
        except Exception:
            logger.exception("Flow step %s failed", node_id)
            fail(node_id, "This step failed unexpectedly.")

        publish()

    if cancelled():
        return RunResult("cancelled", states, [], "The run was cancelled.")

    failed = [node_id for node_id, state in states.items() if state["status"] == "error"]

    # Results are the files reaching result steps, or the files nothing uses.
    final = [n for n in order if nodes[n].op == OUTPUT]
    if not final:
        used = {edge.source for edge in definition.edges}
        final = [n for n in order if n not in used and nodes[n].op != SOURCE]

    outputs: list[str] = []

    for node_id in final:
        if states[node_id]["status"] == "done":
            outputs.extend(item.name for item in items[node_id] if item.name not in outputs)

    # A finished step's files stay hidden unless they are the result.
    file_store.set_intermediate([name for name in outputs if any(name in v for v in created.values())], False)

    if failed:
        first = states[failed[0]]
        return RunResult("failed", states, outputs, first.get("error"))

    return RunResult("done", states, outputs)


def _source_items(node_id: str, names: list[str]) -> list[Item]:
    if not names:
        raise FlowError("This source has no files. Choose files for it before running.")

    found = []

    for name in names:
        path = file_store.locate(name)

        if path is None:
            raise FlowError(f"{name} was not found. It may have been deleted.")

        found.append(Item(path, file_store.kind_of(name)))

    return found


def _run_operation(
    operation: registry.Operation,
    settings,
    by_port: dict[str, list[Item]],
    deadline: float,
    cancelled: Callable[[], bool],
) -> list[Path]:
    main_port = operation.inputs[0]
    main_items = by_port[main_port.name]

    for port in operation.inputs:
        wrong = [item for item in by_port[port.name] if item.kind != port.kind]

        if wrong:
            raise FlowError(
                f"{operation.label} needs {port.kind} files, but received {wrong[0].kind} ({wrong[0].name})."
            )

        if not by_port[port.name]:
            raise FlowError(f"{operation.label} received no {port.kind} files.")

    if operation.mode == "combine":
        calls = [{port.name: [item.path for item in by_port[port.name]] for port in operation.inputs}]
    else:
        calls = [
            {
                main_port.name: [item.path],
                **{
                    port.name: [by_port[port.name][0].path]
                    for port in operation.inputs[1:]
                },
            }
            for item in main_items
        ]

    made: list[Path] = []

    for call in calls:
        if cancelled():
            break

        if time.monotonic() > deadline:
            raise FlowError("The run exceeded its time limit.")

        made.extend(operation.run(call, settings))

    return made
