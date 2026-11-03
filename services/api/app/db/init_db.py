from uuid import uuid4

from sqlalchemy import inspect, text

from app.db.base import Base
from app.db.models import PDFJob  # noqa: F401
from app.db.session import engine


def migrate_pdf_jobs() -> None:
    """Add public UUID identifiers to existing PDF jobs."""
    inspector = inspect(engine)

    if "pdf_jobs" not in inspector.get_table_names():
        return

    columns = {
        column["name"]
        for column in inspector.get_columns("pdf_jobs")
    }

    if "public_id" not in columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE pdf_jobs ADD COLUMN public_id VARCHAR(36)")
            )

    with engine.begin() as connection:
        existing_jobs = connection.execute(
            text(
                "SELECT id FROM pdf_jobs "
                "WHERE public_id IS NULL OR public_id = ''"
            )
        ).scalars().all()

        for job_id in existing_jobs:
            connection.execute(
                text(
                    "UPDATE pdf_jobs SET public_id = :public_id "
                    "WHERE id = :job_id"
                ),
                {
                    "public_id": str(uuid4()),
                    "job_id": job_id,
                },
            )

        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS "
                "ix_pdf_jobs_public_id ON pdf_jobs (public_id)"
            )
        )


def init_db() -> None:
    """Create database tables and apply required migrations."""
    Base.metadata.create_all(bind=engine)
    migrate_pdf_jobs()

    print("Database initialization completed successfully.")

    for table_name in inspect(engine).get_table_names():
        print(f"- {table_name}")


if __name__ == "__main__":
    init_db()