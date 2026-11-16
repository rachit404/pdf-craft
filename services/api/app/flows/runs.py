"""Saving flow runs so their progress can be polled."""

import json
import logging
import threading
import time
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import delete, select

from app.db.models import FlowRun
from app.db.session import SessionLocal


logger = logging.getLogger(__name__)

_cancelled: set[str] = set()
_lock = threading.Lock()

FINISHED = {"done", "failed", "cancelled"}


def create(owner: str, definition: dict, inputs: dict) -> str:
    run_id = uuid4().hex

    with SessionLocal() as db:
        db.add(
            FlowRun(
                id=run_id,
                owner_id=owner,
                status="queued",
                definition=json.dumps(definition),
                inputs=json.dumps(inputs),
            )
        )
        db.commit()

    return run_id


def update(run_id: str, **fields) -> None:
    """Change a run. JSON fields (node_states, outputs) are given as objects."""
    with SessionLocal() as db:
        run = db.get(FlowRun, run_id)

        if run is None:
            return

        for key, value in fields.items():
            if key in ("node_states", "outputs"):
                value = json.dumps(value, default=str)

            setattr(run, key, value)

        if fields.get("status") in FINISHED:
            run.finished_at = datetime.now(timezone.utc)

        db.commit()


def as_dict(run: FlowRun) -> dict:
    return {
        "id": run.id,
        "status": run.status,
        "definition": json.loads(run.definition),
        "node_states": json.loads(run.node_states or "{}"),
        "outputs": json.loads(run.outputs or "[]"),
        "error": run.error,
        "created_at": run.created_at,
        "finished_at": run.finished_at,
    }


def get(run_id: str, owner: str) -> dict | None:
    with SessionLocal() as db:
        run = db.get(FlowRun, run_id)

        return as_dict(run) if run and run.owner_id == owner else None


def list_runs(owner: str, limit: int = 50) -> list[dict]:
    with SessionLocal() as db:
        rows = db.scalars(
            select(FlowRun)
            .where(FlowRun.owner_id == owner)
            .order_by(FlowRun.created_at.desc())
            .limit(limit)
        )

        return [as_dict(run) for run in rows]


def delete_run(run_id: str, owner: str) -> bool:
    with SessionLocal() as db:
        run = db.get(FlowRun, run_id)

        if run is None or run.owner_id != owner:
            return False

        db.delete(run)
        db.commit()

    return True


def request_cancel(run_id: str) -> None:
    with _lock:
        _cancelled.add(run_id)


def is_cancelled(run_id: str) -> bool:
    with _lock:
        return run_id in _cancelled


def forget_cancel(run_id: str) -> None:
    with _lock:
        _cancelled.discard(run_id)


def fail_interrupted() -> None:
    """After a restart, runs that were in progress can never finish."""
    try:
        with SessionLocal() as db:
            for run in db.scalars(select(FlowRun).where(FlowRun.status.in_(("queued", "running")))):
                run.status = "failed"
                run.error = "The server restarted while this run was in progress."
                run.finished_at = datetime.now(timezone.utc)

            db.commit()
    except Exception:
        logger.warning("Could not close interrupted runs.", exc_info=True)


def prune(cutoff_timestamp: float) -> None:
    """Delete finished runs older than the retention cutoff."""
    try:
        cutoff = datetime.fromtimestamp(cutoff_timestamp, tz=timezone.utc)

        with SessionLocal() as db:
            db.execute(
                delete(FlowRun).where(
                    FlowRun.finished_at.is_not(None), FlowRun.finished_at < cutoff
                )
            )
            db.commit()
    except Exception:
        logger.warning("Could not prune flow runs.", exc_info=True)
