"""Optional LibreOffice engine for high-fidelity Word/PowerPoint -> PDF.

LibreOffice is detected at call time. When it is missing, callers fall back to
the basic text-only converter, so the application works without it.

Environment variables:
    PDF_CRAFT_SOFFICE          explicit path to the soffice executable
    PDF_CRAFT_OFFICE_TIMEOUT   seconds before a conversion is aborted (120)
    PDF_CRAFT_OFFICE_WORKERS   concurrent conversions allowed (2)
"""

import os
import shutil
import signal
import subprocess
import tempfile
import threading
from pathlib import Path


TIMEOUT_SECONDS = int(os.getenv("PDF_CRAFT_OFFICE_TIMEOUT", "120"))

_slots = threading.BoundedSemaphore(int(os.getenv("PDF_CRAFT_OFFICE_WORKERS", "2")))

_WINDOWS_LOCATIONS = (
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
)


def find_soffice() -> str | None:
    candidates = [
        os.getenv("PDF_CRAFT_SOFFICE"),
        shutil.which("soffice"),
        shutil.which("libreoffice"),
        *_WINDOWS_LOCATIONS,
    ]

    return next(
        (path for path in candidates if path and Path(path).is_file()),
        None,
    )


def _terminate(process: subprocess.Popen) -> None:
    """Kill soffice and the soffice.bin worker it spawns."""
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(process.pid)],
            capture_output=True,
            check=False,
        )
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

    process.wait()


def convert_to_pdf(source: Path, output: Path) -> None:
    """Convert a .docx/.pptx file to PDF at `output`."""
    soffice = find_soffice()

    if soffice is None:
        raise RuntimeError("LibreOffice is not installed.")

    output.parent.mkdir(parents=True, exist_ok=True)

    with _slots, tempfile.TemporaryDirectory(
        prefix=".office-",
        dir=output.parent,
        ignore_cleanup_errors=True,
    ) as directory:
        work = Path(directory)
        document = work / f"input{source.suffix.lower()}"
        result_dir = work / "out"
        shutil.copyfile(source, document)

        # A private profile per call avoids lock clashes between conversions.
        process = subprocess.Popen(
            [
                soffice,
                f"-env:UserInstallation={(work / 'profile').as_uri()}",
                "--headless",
                "--norestore",
                "--nolockcheck",
                "--nodefault",
                "--nologo",
                "--convert-to",
                "pdf",
                "--outdir",
                str(result_dir),
                str(document),
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=os.name != "nt",
        )

        try:
            process.wait(timeout=TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired as exc:
            _terminate(process)
            raise ValueError(
                f"Conversion timed out after {TIMEOUT_SECONDS} seconds."
            ) from exc

        produced = result_dir / "input.pdf"

        if process.returncode != 0 or not produced.is_file() or produced.stat().st_size == 0:
            raise ValueError("The document could not be converted. It may be corrupt.")

        produced.replace(output)
