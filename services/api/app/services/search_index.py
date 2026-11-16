"""A full-text index of the stored PDFs (SQLite FTS5), built as files are searched.

Each page's text is indexed once; searches then read the index instead of
opening every file. The index is removed with its files by the retention sweep.
Only SQLite has FTS5, so `available()` is False elsewhere and the caller falls
back to scanning.
"""

import logging
import re
import time

import pymupdf

from app.db.session import engine
from app.services import file_store

logger = logging.getLogger(__name__)

MAX_FILES = 300
MAX_HITS = 50
HITS_PER_FILE = 5
TIME_BUDGET_SECONDS = 8.0


def available() -> bool:
    return engine.dialect.name == "sqlite"


def _ensure() -> None:
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE VIRTUAL TABLE IF NOT EXISTS page_text USING fts5("
            "name UNINDEXED, page UNINDEXED, body, tokenize='unicode61 remove_diacritics 2')"
        )
        connection.exec_driver_sql("CREATE TABLE IF NOT EXISTS indexed_files (name TEXT PRIMARY KEY)")


def _index_file(name: str) -> None:
    path = file_store.locate(name)
    rows: list[tuple[str, int, str]] = []

    if path is not None:
        try:
            with pymupdf.open(path) as document:
                if not document.needs_pass:
                    rows = [(name, number, page.get_text()) for number, page in enumerate(document, start=1)]
        except (pymupdf.FileDataError, ValueError, RuntimeError):
            rows = []

    with engine.begin() as connection:
        connection.exec_driver_sql("DELETE FROM page_text WHERE name = ?", (name,))

        for row in rows:
            if row[2].strip():
                connection.exec_driver_sql("INSERT INTO page_text (name, page, body) VALUES (?, ?, ?)", row)

        # Files that cannot be read are remembered too, so they are not retried on every search.
        connection.exec_driver_sql("INSERT OR REPLACE INTO indexed_files (name) VALUES (?)", (name,))


def _match_expression(query: str) -> str:
    words = re.findall(r"\w+", query, flags=re.UNICODE)

    if not words:
        raise ValueError("Type at least two characters.")

    return '"' + " ".join(words) + '" *'


def search(owner: str, query: str) -> dict:
    """Index any new PDFs (within a time budget), then look the words up."""
    expression = _match_expression(query)
    _ensure()

    deadline = time.monotonic() + TIME_BUDGET_SECONDS
    records = [
        record
        for record in file_store.list_files(owner, "pdf", False, MAX_FILES)
        if record["available"]
    ]
    by_name = {record["name"]: record for record in records}
    complete = True

    with engine.connect() as connection:
        done = {row[0] for row in connection.exec_driver_sql("SELECT name FROM indexed_files")}

    for record in records:
        if record["name"] in done:
            continue

        if time.monotonic() > deadline:
            complete = False
            break

        _index_file(record["name"])

    hits: list[dict] = []
    per_file: dict[str, int] = {}

    with engine.connect() as connection:
        rows = connection.exec_driver_sql(
            "SELECT name, page, snippet(page_text, 2, '', '', ' ... ', 14) FROM page_text "
            "WHERE page_text MATCH ? ORDER BY rank LIMIT 400",
            (expression,),
        ).fetchall()

    for name, page, snippet in rows:
        record = by_name.get(name)

        if record is None or per_file.get(name, 0) >= HITS_PER_FILE:
            continue

        per_file[name] = per_file.get(name, 0) + 1
        hits.append({"name": name, "original_name": record["original_name"], "page": int(page), "snippet": " ".join(str(snippet).split())})

        if len(hits) >= MAX_HITS:
            break

    return {"query": query.strip(), "files_searched": len(by_name), "complete": complete, "hits": hits}


def forget_missing() -> None:
    """Drop index entries of files that no longer exist."""
    try:
        _ensure()

        with engine.connect() as connection:
            names = [row[0] for row in connection.exec_driver_sql("SELECT name FROM indexed_files")]

        gone = [name for name in names if file_store.locate(name) is None]

        with engine.begin() as connection:
            for name in gone:
                connection.exec_driver_sql("DELETE FROM page_text WHERE name = ?", (name,))
                connection.exec_driver_sql("DELETE FROM indexed_files WHERE name = ?", (name,))
    except Exception:
        logger.warning("Could not tidy the search index.", exc_info=True)
