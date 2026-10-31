
import os
from pathlib import Path

from sqlalchemy import URL, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


# Resolve the API directory:
# services/api/
API_DIR = Path(__file__).resolve().parents[1]

# Default local database location:
# services/api/data/pdf_craft.db
DATA_DIR = API_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_DATABASE_PATH = DATA_DIR / "pdf_craft.db"

# Optional override, for example:
# PDF_CRAFT_DATABASE_URL=sqlite:///D:/data/pdf_craft.db
DATABASE_URL = os.getenv("PDF_CRAFT_DATABASE_URL")

if DATABASE_URL:
    connect_args = (
        {"check_same_thread": False}
        if DATABASE_URL.startswith("sqlite")
        else {}
    )

    engine = create_engine(
        DATABASE_URL,
        connect_args=connect_args,
        pool_pre_ping=True,
    )
else:
    engine = create_engine(
        URL.create(
            drivername="sqlite",
            database=str(DEFAULT_DATABASE_PATH),
        ),
        connect_args={"check_same_thread": False},
    )


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy database models."""

    pass
