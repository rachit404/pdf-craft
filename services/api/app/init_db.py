
from app.database import Base, engine
from app.models import PDFJob  # noqa: F401


def init_db() -> None:
    """Create all registered database tables."""
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully.")

    for table_name in Base.metadata.tables:
        print(f"- {table_name}")


if __name__ == "__main__":
    init_db()
