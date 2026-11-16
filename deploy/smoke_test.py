#!/usr/bin/env python3
"""End-to-end check of every PDF Craft operation against a running server.

Run it with the application's own Python, so PyMuPDF, python-docx and
python-pptx are available:

    /opt/pdf-craft/venv/bin/python deploy/smoke_test.py https://pdf.home.lan --insecure --password '...'
    python deploy/smoke_test.py http://127.0.0.1:8000 --api-prefix ""      # backend directly

Each operation is run on small generated files and its result is downloaded
and opened, so a pass means the produced file is really usable. Files the test
creates are removed from the history afterwards (use --keep to leave them).
Exit status: 0 when everything passed, 1 otherwise.
"""

import argparse
import http.cookiejar
import io
import json
import ssl
import sys
import urllib.error
import urllib.request
import uuid
import zipfile

import pymupdf
from docx import Document
from pptx import Presentation


class Failure(Exception):
    pass


class Client:
    def __init__(self, base: str, insecure: bool):
        context = ssl.create_default_context()

        if insecure:
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE

        self.base = base.rstrip("/")
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
            urllib.request.HTTPSHandler(context=context),
        )

    def call(self, method, path, *, body=None, files=None):
        """Returns (status, headers, bytes). `files` is {field: (name, bytes, type)}."""
        headers, data = {}, None

        if files:
            boundary = uuid.uuid4().hex
            parts = []
            for field, (name, content, kind) in files.items():
                parts.append(
                    f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; '
                    f'filename="{name}"\r\nContent-Type: {kind}\r\n\r\n'.encode()
                    + content
                    + b"\r\n"
                )
            data = b"".join(parts) + f"--{boundary}--\r\n".encode()
            headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        elif body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"

        request = urllib.request.Request(
            self.base + path, data=data, headers=headers, method=method
        )

        try:
            with self.opener.open(request, timeout=300) as response:
                return response.status, response.headers, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.headers, error.read()

    def json(self, method, path, expect=200, **kwargs):
        status, _, raw = self.call(method, path, **kwargs)

        if status != expect:
            raise Failure(f"{method} {path} returned {status}, expected {expect}: {raw[:200]!r}")

        return json.loads(raw) if raw else {}


# ---------------------------------------------------------
# Sample documents
# ---------------------------------------------------------

def sample_pdf(*pages: str) -> bytes:
    with pymupdf.open() as document:
        for text in pages:
            document.new_page(width=300, height=400).insert_text((40, 80), text, fontsize=14)

        return document.tobytes()


def sample_png() -> bytes:
    pixmap = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 80, 40), False)
    pixmap.clear_with(180)

    return pixmap.tobytes("png")


def sample_docx() -> bytes:
    buffer = io.BytesIO()
    document = Document()
    document.add_paragraph("Smoke test document")
    document.save(buffer)

    return buffer.getvalue()


def sample_pptx() -> bytes:
    buffer = io.BytesIO()
    presentation = Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[5])
    slide.shapes.title.text = "Smoke test slide"
    presentation.save(buffer)

    return buffer.getvalue()


def pdf_pages(data: bytes) -> list[str]:
    with pymupdf.open(stream=data, filetype="pdf") as document:
        return [page.get_text() for page in document]


# ---------------------------------------------------------
# Checks
# ---------------------------------------------------------

def run(client: Client, password: str | None, keep: bool) -> list[tuple[str, str]]:
    results: list[tuple[str, str]] = []
    outputs: set[str] = set()
    state: dict = {}

    def check(name):
        def decorate(function):
            try:
                function()
                results.append((name, ""))
            except Exception as error:  # noqa: BLE001 - report every kind of failure
                results.append((name, str(error) or type(error).__name__))

            return function

        return decorate

    def download(output_filename: str) -> bytes:
        outputs.add(output_filename)
        status, _, content = client.call("GET", f"/outputs/{output_filename}")

        if status != 200 or not content:
            raise Failure(f"download of {output_filename} returned {status}")

        return content

    def upload(name: str, content: bytes, kind="application/pdf", path="/uploads") -> str:
        response = client.json("POST", path, expect=201, files={"file": (name, content, kind)})
        return response["stored_filename"]

    def operate(path: str, body: dict | None = None) -> bytes:
        result = client.json("POST", path, body=body if body is not None else {})
        return download(result["output_filename"])

    def expect_pages(data: bytes, count: int):
        found = len(pdf_pages(data))

        if found != count:
            raise Failure(f"expected {count} pages, found {found}")

    @check("server is healthy")
    def _():
        if client.json("GET", "/health").get("status") != "ok":
            raise Failure("health check not ok")

    if password is not None:
        @check("anonymous requests are refused")
        def _():
            anonymous = Client(client.base, insecure=True)
            status, _, _ = anonymous.call("GET", "/jobs")

            if status != 401:
                raise Failure(f"/jobs answered {status} without signing in (expected 401)")

        @check("wrong password is refused")
        def _():
            client.json("POST", "/auth/login", expect=401, body={"password": "definitely-wrong"})

        @check("sign in")
        def _():
            client.json("POST", "/auth/login", body={"password": password})

    @check("upload PDFs and an image")
    def _():
        state["a"] = upload("a.pdf", sample_pdf("Page one", "Page two", "Page three"))
        state["b"] = upload("b.pdf", sample_pdf("Other one", "Other two"))
        state["img"] = upload("logo.png", sample_png(), "image/png", "/uploads/image")

    if "a" not in state:
        return results

    a, b, img = state["a"], state["b"], state["img"]

    @check("details, text and page preview")
    def _():
        info = client.json("GET", f"/uploads/{a}/info")
        assert info["page_count"] == 3, info
        text = client.json("GET", f"/uploads/{a}/text")
        assert "Page two" in text["pages"][1]["text"], text
        status, headers, image = client.call("GET", f"/uploads/{a}/pages/1/preview")
        assert status == 200 and image[:2] == b"\xff\xd8", "preview is not a JPEG"

    pdf_tests = [
        ("merge", "/operations/merge", {"filenames": [a, b]}, 5),
        ("extract pages", f"/operations/{a}/extract-pages", {"pages": [1, 3]}, 2),
        ("reorder pages", f"/operations/{a}/reorder-pages", {"order": [3, 2, 1]}, 3),
        ("delete pages", f"/operations/{a}/delete-pages", {"pages": [2]}, 2),
        ("duplicate pages", f"/operations/{a}/duplicate-pages", {"pages": [1]}, 4),
        ("rotate", f"/operations/{a}/rotate", {"pages": [1], "degrees": 90}, 3),
        ("watermark", f"/operations/{a}/watermark", {"text": "DRAFT"}, 3),
        ("page numbers", f"/operations/{a}/page-numbers", {}, 3),
        ("header and footer", f"/operations/{a}/header-footer", {"header": "Top", "footer": "Bottom"}, 3),
        ("background", f"/operations/{a}/background", {"red": 1, "green": 1, "blue": 0.8}, 3),
        ("crop", f"/operations/{a}/crop", {"left": 10, "bottom": 10, "right": 10, "top": 10}, 3),
        ("add text", f"/operations/{a}/add-text", {"text": "Hello", "x": 50, "y": 50}, 3),
        (
            "add image",
            f"/operations/{a}/add-image",
            {"image_filename": img, "x": 20, "y": 20, "width": 80, "height": 40},
            3,
        ),
        ("images to PDF", "/conversions/images-to-pdf", {"filenames": [img, img]}, 2),
        ("sanitize", f"/security/{a}/sanitize", {}, 3),
    ]

    for name, path, body, pages in pdf_tests:
        @check(name)
        def _(path=path, body=body, pages=pages):
            expect_pages(operate(path, body), pages)

    @check("split into a ZIP")
    def _():
        result = client.json("POST", f"/operations/{a}/split", body={"ranges": [[1, 1], [2, 3]]})
        names = zipfile.ZipFile(io.BytesIO(download(result["output_filename"]))).namelist()
        assert len(names) == 2, names

    @check("compress (lossless and strong)")
    def _():
        for level in ("lossless", "strong"):
            result = client.json("POST", f"/uploads/{a}/compress", body={"level": level})
            expect_pages(download(result["output_filename"]), 3)

    @check("add text is visible in the result")
    def _():
        data = operate(f"/operations/{a}/add-text", {"text": "Findable", "x": 50, "y": 200, "pages": [2]})
        pages = pdf_pages(data)
        assert "Findable" in pages[1] and "Findable" not in pages[0], pages

    @check("PDF to images, Word, Excel and PowerPoint")
    def _():
        images = client.json("POST", f"/conversions/{a}/to-images", body={"image_format": "png", "dpi": 72})
        assert len(zipfile.ZipFile(io.BytesIO(download(images["output_filename"]))).namelist()) == 3
        word = client.json("POST", f"/conversions/{a}/to-docx")
        assert download(word["output_filename"])[:2] == b"PK"
        sheet = client.json("POST", f"/conversions/{a}/to-xlsx")
        assert download(sheet["output_filename"])[:2] == b"PK"
        slides = client.json("POST", f"/conversions/{a}/to-pptx", body={"dpi": 72})
        assert download(slides["output_filename"])[:2] == b"PK"

    @check("Word and PowerPoint to PDF")
    def _():
        for route, name, content in (
            ("docx-to-pdf", "doc.docx", sample_docx()),
            ("pptx-to-pdf", "deck.pptx", sample_pptx()),
        ):
            result = client.json(
                "POST", f"/conversions/{route}",
                files={"file": (name, content, "application/octet-stream")},
            )
            assert pdf_pages(download(result["output_filename"])), f"{route} produced no pages"

    @check("protect, wrong password, unlock")
    def _():
        protected = operate(f"/security/{a}/protect", {"user_password": "smoke-test-pw"})
        locked = upload("locked.pdf", protected)
        client.json("POST", f"/security/{locked}/unlock", expect=422, body={"password": "wrong"})
        opened = client.json("POST", f"/security/{locked}/unlock", body={"password": "smoke-test-pw"})
        expect_pages(download(opened["output_filename"]), 3)

    @check("redaction removes the text")
    def _():
        data = operate(f"/security/{a}/redact", {"terms": ["two"]})
        assert not any("two" in page.lower() for page in pdf_pages(data)), "text survived redaction"

    @check("history lists the results")
    def _():
        names = {job["output_filename"] for job in client.json("GET", "/jobs?limit=100")}
        assert outputs & names, "none of the produced files appear in the history"
        assert "retention_hours" in client.json("GET", "/jobs/retention")

    if not keep:
        @check("clean up the test files")
        def _():
            for job in client.json("GET", "/jobs?limit=100"):
                if job["output_filename"] in outputs:
                    client.json("DELETE", f"/jobs/{job['public_id']}")

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("url", help="Address of the site, e.g. https://pdf.home.lan")
    parser.add_argument("--password", help="Sign-in password, when the server asks for one")
    parser.add_argument("--api-prefix", default="/api/backend", help='Use "" when testing the backend directly')
    parser.add_argument("--insecure", action="store_true", help="Accept a self-signed certificate")
    parser.add_argument("--keep", action="store_true", help="Leave the test results in the history")
    args = parser.parse_args()

    client = Client(args.url.rstrip("/") + args.api_prefix.rstrip("/"), args.insecure)
    results = run(client, args.password, args.keep)

    width = max(len(name) for name, _ in results)
    for name, problem in results:
        print(f"{'PASS' if not problem else 'FAIL'}  {name.ljust(width)}  {problem}".rstrip())

    failed = [name for name, problem in results if problem]
    print(f"\n{len(results) - len(failed)} of {len(results)} checks passed.")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
