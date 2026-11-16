"""Find words inside the PDFs that are stored on the server."""

import time

import pymupdf

from app.services import file_store, search_index

MAX_FILES = 100
MAX_HITS = 50
HITS_PER_FILE = 5
TIME_BUDGET_SECONDS = 8.0
CONTEXT = 45


def _snippet(text: str, start: int, length: int) -> str:
    left = max(0, start - CONTEXT)
    piece = text[left : start + length + CONTEXT]

    return " ".join(piece.split())


def search(owner: str, query: str) -> dict:
    """Find a word or phrase: through the full-text index when there is one, else by scanning."""
    if len(query.strip()) < 2:
        raise ValueError("Type at least two characters.")

    if search_index.available():
        return search_index.search(owner, query)

    return scan(owner, query)


def scan(owner: str, query: str) -> dict:
    """Look through the newest PDFs, page by page, for a word or phrase."""
    needle = query.strip().lower()

    deadline = time.monotonic() + TIME_BUDGET_SECONDS
    hits: list[dict] = []
    searched = 0
    complete = True

    for record in file_store.list_files(owner, "pdf", False, MAX_FILES):
        if not record["available"]:
            continue

        path = file_store.locate(record["name"])

        if path is None:
            continue

        if time.monotonic() > deadline or len(hits) >= MAX_HITS:
            complete = False
            break

        found = 0
        searched += 1

        try:
            with pymupdf.open(path) as document:
                if document.needs_pass:
                    continue

                for number, page in enumerate(document, start=1):
                    text = page.get_text()
                    index = text.lower().find(needle)

                    while index != -1 and found < HITS_PER_FILE and len(hits) < MAX_HITS:
                        hits.append(
                            {
                                "name": record["name"],
                                "original_name": record["original_name"],
                                "page": number,
                                "snippet": _snippet(text, index, len(needle)),
                            }
                        )
                        found += 1
                        index = text.lower().find(needle, index + len(needle))

                    if found >= HITS_PER_FILE:
                        break
        except (pymupdf.FileDataError, ValueError, RuntimeError):
            continue

    return {"query": query.strip(), "files_searched": searched, "complete": complete, "hits": hits}
