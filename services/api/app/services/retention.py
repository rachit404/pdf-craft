"""Delete stored uploads and outputs after a retention period.

PDF_CRAFT_RETENTION_HOURS sets the period (default 24). 0 keeps files forever.
"""

import asyncio
import logging
import os
import shutil
import time

from app import storage
from app.flows import cache as step_cache
from app.flows import runs as flow_runs
from app.services import history, search_index


logger = logging.getLogger(__name__)

RETENTION_HOURS = float(os.getenv("PDF_CRAFT_RETENTION_HOURS", "24"))
SWEEP_INTERVAL_SECONDS = 15 * 60


def sweep(max_age_seconds: float) -> int:
    """Remove files and scratch folders older than `max_age_seconds`.

    Returns the number of entries deleted. History rows pointing at files
    that no longer exist are removed as well.
    """
    cutoff = time.time() - max_age_seconds
    deleted = 0
    remaining: list[set[str]] = []

    for directory in (storage.UPLOAD_DIR, storage.OUTPUT_DIR):
        kept: set[str] = set()

        if directory.is_dir():
            for entry in directory.iterdir():
                try:
                    if entry.stat().st_mtime > cutoff:
                        kept.add(entry.name)
                    elif entry.is_dir():
                        shutil.rmtree(entry, ignore_errors=True)
                        deleted += 1
                    else:
                        entry.unlink(missing_ok=True)
                        deleted += 1
                except OSError:
                    # In use or already gone; the next sweep retries.
                    kept.add(entry.name)

        remaining.append(kept)

    history.forget_missing(*remaining)
    flow_runs.prune(cutoff)
    step_cache.prune(cutoff)

    if search_index.available():
        search_index.forget_missing()
    return deleted


def purge_all() -> int:
    """Delete every stored file and the whole history, right now."""
    return sweep(max_age_seconds=-1)


async def run_forever() -> None:
    """Background loop started with the application."""
    if RETENTION_HOURS <= 0:
        return

    while True:
        try:
            deleted = await asyncio.to_thread(sweep, RETENTION_HOURS * 3600)

            if deleted:
                logger.info("Retention sweep removed %d stored item(s).", deleted)
        except Exception:
            logger.warning("Retention sweep failed.", exc_info=True)

        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
