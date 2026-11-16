"""Flows the user keeps, so they can be opened and run again."""

import json
from uuid import uuid4

from sqlalchemy import select

from app.db.models import SavedFlow, utc_now
from app.db.session import SessionLocal

MAX_SAVED = 200


def _describe(row: SavedFlow, *, with_definition: bool) -> dict:
    data = {
        "id": row.id,
        "name": row.name,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }

    if with_definition:
        data["definition"] = json.loads(row.definition)

    return data


def list_flows(owner: str) -> list[dict]:
    with SessionLocal() as db:
        rows = db.scalars(
            select(SavedFlow).where(SavedFlow.owner_id == owner).order_by(SavedFlow.updated_at.desc())
        )

        return [_describe(row, with_definition=True) for row in rows]


def get(flow_id: str, owner: str) -> dict | None:
    with SessionLocal() as db:
        row = db.get(SavedFlow, flow_id)

        return _describe(row, with_definition=True) if row and row.owner_id == owner else None


def create(owner: str, name: str, definition: dict) -> dict | None:
    """Store a new flow; None when the limit is reached."""
    with SessionLocal() as db:
        count = len(db.scalars(select(SavedFlow.id).where(SavedFlow.owner_id == owner)).all())

        if count >= MAX_SAVED:
            return None

        row = SavedFlow(id=uuid4().hex, owner_id=owner, name=name, definition=json.dumps(definition))
        db.add(row)
        db.commit()
        db.refresh(row)

        return _describe(row, with_definition=True)


def update(flow_id: str, owner: str, name: str, definition: dict) -> dict | None:
    with SessionLocal() as db:
        row = db.get(SavedFlow, flow_id)

        if row is None or row.owner_id != owner:
            return None

        row.name = name
        row.definition = json.dumps(definition)
        row.updated_at = utc_now()
        db.commit()
        db.refresh(row)

        return _describe(row, with_definition=True)


def delete(flow_id: str, owner: str) -> bool:
    with SessionLocal() as db:
        row = db.get(SavedFlow, flow_id)

        if row is None or row.owner_id != owner:
            return False

        db.delete(row)
        db.commit()

        return True
