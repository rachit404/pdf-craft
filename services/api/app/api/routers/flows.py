from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from app.flows import runs
from app.flows.definition import FlowDefinition, Issue, masked, validate
from app.flows.executor import FlowError, run_flow
from app.services import file_store, saved_flows


router = APIRouter(prefix="/flows", tags=["Flows"])

OWNER = file_store.DEFAULT_OWNER


class RunRequest(BaseModel):
    definition: FlowDefinition
    # Source step id -> stored file names that step starts with.
    inputs: dict[str, list[str]] = Field(default_factory=dict)


def _execute(run_id: str, definition: FlowDefinition, inputs: dict[str, list[str]]) -> None:
    """Background task: run the flow and keep the stored run up to date."""
    runs.update(run_id, status="running")

    try:
        result = run_flow(
            definition,
            inputs,
            owner=OWNER,
            progress=lambda states: runs.update(run_id, node_states=states),
            cancelled=lambda: runs.is_cancelled(run_id),
        )
        runs.update(
            run_id,
            status=result.status,
            node_states=result.node_states,
            outputs=result.outputs,
            error=result.error,
        )
    except FlowError as error:
        runs.update(run_id, status="failed", error=str(error))
    except Exception:
        runs.update(run_id, status="failed", error="The run failed unexpectedly.")
        raise
    finally:
        runs.forget_cancel(run_id)


def _with_files(run: dict) -> dict:
    """Attach the file records of a run's results."""
    run["files"] = [record for name in run["outputs"] if (record := file_store.get(name))]
    return run


class SavedFlowRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    # Steps, connections and canvas positions. Extra fields (positions) are kept.
    definition: dict


def _checked_definition(request: SavedFlowRequest) -> dict:
    """Refuse a definition the engine could not read; store it with passwords masked."""
    try:
        parsed = FlowDefinition.model_validate(request.definition)
    except ValueError as error:
        raise HTTPException(422, "That is not a valid flow.") from error

    stored = dict(request.definition)
    secret_free = masked(parsed)["nodes"]
    positions = {node.get("id"): node.get("position") for node in request.definition.get("nodes", [])}

    stored["nodes"] = [
        {**node, **({"position": positions[node["id"]]} if positions.get(node["id"]) else {})}
        for node in secret_free
    ]
    stored["edges"] = masked(parsed)["edges"]

    return stored


@router.get("/saved")
def list_saved() -> list[dict]:
    return saved_flows.list_flows(OWNER)


@router.post("/saved", status_code=201)
def save_flow(request: SavedFlowRequest) -> dict:
    created = saved_flows.create(OWNER, request.name.strip(), _checked_definition(request))

    if created is None:
        raise HTTPException(409, f"You can keep up to {saved_flows.MAX_SAVED} saved flows.")

    return created


@router.put("/saved/{flow_id}")
def update_saved(flow_id: str, request: SavedFlowRequest) -> dict:
    updated = saved_flows.update(flow_id, OWNER, request.name.strip(), _checked_definition(request))

    if updated is None:
        raise HTTPException(404, "Saved flow not found.")

    return updated


@router.delete("/saved/{flow_id}")
def delete_saved(flow_id: str) -> dict:
    if not saved_flows.delete(flow_id, OWNER):
        raise HTTPException(404, "Saved flow not found.")

    return {"deleted": flow_id}


@router.post("/validate")
def validate_flow(definition: FlowDefinition) -> dict:
    issues: list[Issue] = validate(definition)

    return {"valid": not issues, "issues": [issue.model_dump() for issue in issues]}


@router.post("/runs", status_code=202)
def start_run(request: RunRequest, tasks: BackgroundTasks) -> dict:
    issues = validate(request.definition)

    if issues:
        raise HTTPException(422, {"issues": [issue.model_dump() for issue in issues]})

    run_id = runs.create(OWNER, masked(request.definition), request.inputs)
    tasks.add_task(_execute, run_id, request.definition, request.inputs)

    return {"id": run_id, "status": "queued"}


@router.get("/runs")
def list_runs(limit: int = 30) -> list[dict]:
    return [_with_files(run) for run in runs.list_runs(OWNER, max(1, min(limit, 100)))]


@router.get("/runs/{run_id}")
def get_run(run_id: str) -> dict:
    run = runs.get(run_id, OWNER)

    if run is None:
        raise HTTPException(404, "Run not found.")

    return _with_files(run)


@router.post("/runs/{run_id}/cancel")
def cancel_run(run_id: str) -> dict:
    run = runs.get(run_id, OWNER)

    if run is None:
        raise HTTPException(404, "Run not found.")

    if run["status"] not in runs.FINISHED:
        runs.request_cancel(run_id)

    return {"id": run_id, "cancelling": run["status"] not in runs.FINISHED}


@router.delete("/runs/{run_id}")
def delete_run(run_id: str) -> dict:
    if not runs.delete_run(run_id, OWNER):
        raise HTTPException(404, "Run not found.")

    return {"deleted": run_id}
