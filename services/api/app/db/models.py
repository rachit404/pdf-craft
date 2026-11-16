from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def utc_now() -> datetime:
    """Return the current UTC time as a timezone-aware datetime."""
    return datetime.now(timezone.utc)


class PDFJob(Base):
    """Track a PDF processing job and its current status."""

    __tablename__ = "pdf_jobs"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    public_id: Mapped[str] = mapped_column(
        String(36),
        unique=True,
        nullable=False,
        index=True,
        default=lambda: str(uuid4()),
    )

    owner_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="local",
        server_default="local",
        index=True,
    )

    operation: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        index=True,
    )

    original_filename: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    output_filename: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class StoredFile(Base):
    """A file in storage (upload or result) and where it came from.

    `parent_name` is the file it was made from, `root_name` the first file in
    that chain: together they form the version history of a document.
    """

    __tablename__ = "stored_files"

    name: Mapped[str] = mapped_column(String(80), primary_key=True)
    owner_id: Mapped[str] = mapped_column(
        String(64), nullable=False, default="local", index=True
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    parent_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    root_name: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    # JSON list of every file this one was made from (merge has several).
    sources: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    operation: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Steps inside a flow that are not its final result.
    intermediate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )


class FlowRun(Base):
    """One execution of a flow: its progress and its result."""

    __tablename__ = "flow_runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    owner_id: Mapped[str] = mapped_column(
        String(64), nullable=False, default="local", index=True
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    # Secrets (passwords) are masked before the definition is stored.
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    inputs: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    node_states: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    outputs: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class SavedFlow(Base):
    """A flow the user keeps to run again, with its canvas layout."""

    __tablename__ = "saved_flows"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    owner_id: Mapped[str] = mapped_column(
        String(64), nullable=False, default="local", index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    # JSON: the steps (with passwords masked), connections and canvas positions.
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
