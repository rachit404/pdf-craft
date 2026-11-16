"""Part 10, last slice: annotations, straightening scans, the search index and ZIP download."""

import io
import zipfile

import cv2
import numpy as np
import pymupdf

from app.engines.pdf import power
from test_foundation import clean_records, pdf_bytes, put  # noqa: F401


def stored(client, content, name):
    return put(client, content, name, "application/pdf")["name"]


def result_doc(client, response):
    assert response.status_code == 200, response.text
    download = client.get(f"/files/{response.json()['output_filename']}/download")
    assert download.status_code == 200
    return pymupdf.open(stream=download.content, filetype="pdf")


# ---------------------------------------------------------
# Annotations
# ---------------------------------------------------------

def test_marks_and_words_become_real_annotations(client, pdf_storage):
    name = stored(client, pdf_bytes("alpha beta", "gamma alpha"), "a.pdf")

    response = client.post(
        f"/tools/{name}/annotate",
        json={
            "marks": [
                {"page": 1, "kind": "box", "x0": 30, "y0": 30, "x1": 120, "y1": 60},
                {"page": 2, "kind": "note", "x0": 50, "y0": 50, "x1": 50, "y1": 50, "text": "check this"},
            ],
            "terms": ["alpha"],
        },
    )
    document = result_doc(client, response)

    assert response.json()["annotations_added"] == 4  # box, note and two highlighted words
    kinds = [[a.type[1] for a in page.annots()] for page in document]
    assert sorted(kinds[0]) == ["Highlight", "Square"]
    assert sorted(kinds[1]) == ["Highlight", "Text"]
    assert [a.info["content"] for a in document[1].annots() if a.type[1] == "Text"] == ["check this"]


def test_annotation_requests_are_checked(client, pdf_storage):
    name = stored(client, pdf_bytes("alpha"), "a.pdf")
    post = lambda body: client.post(f"/tools/{name}/annotate", json=body)  # noqa: E731

    assert post({}).status_code == 422
    assert post({"terms": ["zzz-not-there"]}).status_code == 422
    assert post({"marks": [{"page": 9, "x0": 1, "y0": 1, "x1": 20, "y1": 20}]}).status_code == 422
    assert post({"marks": [{"page": 1, "x0": 5, "y0": 5, "x1": 5, "y1": 5}]}).status_code == 422  # no area


# ---------------------------------------------------------
# Straightening scans
# ---------------------------------------------------------

def scanned_pdf(tilt: float) -> bytes:
    """A page of text lines saved as a picture, tilted by `tilt` degrees."""
    canvas = np.full((1100, 850), 255, dtype=np.uint8)

    for row in range(100, 1000, 36):
        cv2.putText(canvas, "The quick brown fox jumps over the lazy dog", (60, row), cv2.FONT_HERSHEY_SIMPLEX, 0.8, 0, 2)

    matrix = cv2.getRotationMatrix2D((425, 550), tilt, 1.0)
    tilted = cv2.warpAffine(canvas, matrix, (850, 1100), borderValue=255)
    _, png = cv2.imencode(".png", tilted)

    with pymupdf.open() as document:
        page = document.new_page(width=425, height=550)
        page.insert_image(page.rect, stream=png.tobytes())

        return document.tobytes()


def page_gray(document):
    pixmap = document[0].get_pixmap(dpi=150, colorspace=pymupdf.csGRAY, alpha=False)

    return np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width)


def test_a_tilted_scan_is_levelled(client, pdf_storage):
    name = stored(client, scanned_pdf(3.0), "scan.pdf")

    with pymupdf.open(stream=scanned_pdf(3.0), filetype="pdf") as before:
        assert abs(power.estimate_skew(page_gray(before))) > 2

    response = client.post(f"/tools/{name}/deskew", json={})
    document = result_doc(client, response)

    assert response.json()["pages_straightened"] == 1
    assert abs(power.estimate_skew(page_gray(document))) <= 0.75


def test_level_pages_and_text_pages_are_left_alone(client, pdf_storage):
    level = client.post(f"/tools/{stored(client, scanned_pdf(0.0), 'level.pdf')}/deskew", json={})
    assert level.json()["pages_straightened"] == 0

    text = client.post(f"/tools/{stored(client, pdf_bytes('real text'), 'text.pdf')}/deskew", json={})
    assert text.json()["pages_straightened"] == 0
    assert "real text" in result_doc(client, text)[0].get_text()


# ---------------------------------------------------------
# Search index
# ---------------------------------------------------------

def test_search_uses_an_index_that_survives_the_file_being_opened_again(client, pdf_storage, monkeypatch):
    from app.services import search_index

    name = stored(client, pdf_bytes("quarterly invoice 4711", "other"), "q.pdf")
    first = client.get("/files/search", params={"q": "invoice 47"}).json()
    assert [(h["page"], h["name"]) for h in first["hits"]] == [(1, name)]

    # The second search must not open the PDF again: it reads the index.
    monkeypatch.setattr(search_index.pymupdf, "open", lambda *a, **k: (_ for _ in ()).throw(AssertionError("re-read")))
    again = client.get("/files/search", params={"q": "QUARTERLY"}).json()
    assert [h["name"] for h in again["hits"]] == [name]


def test_search_forgets_files_that_are_gone(client, pdf_storage):
    from app.services import search_index

    name = stored(client, pdf_bytes("secret word zebra"), "z.pdf")
    assert client.get("/files/search", params={"q": "zebra"}).json()["hits"]

    assert client.delete(f"/files/{name}").status_code == 200
    assert client.get("/files/search", params={"q": "zebra"}).json()["hits"] == []

    search_index.forget_missing()
    with search_index.engine.connect() as connection:
        left = connection.exec_driver_sql("SELECT COUNT(*) FROM page_text WHERE name = ?", (name,)).scalar()
    assert left == 0


def test_search_handles_odd_characters(client, pdf_storage):
    stored(client, pdf_bytes("plain text"), "p.pdf")

    for query in ('"quoted', "a OR b", "col:on*", "(x"):
        assert client.get("/files/search", params={"q": query}).status_code == 200

    assert client.get("/files/search", params={"q": "!!"}).status_code == 422


# ---------------------------------------------------------
# ZIP
# ---------------------------------------------------------

def test_several_files_download_as_one_zip_with_clear_names(client, pdf_storage):
    first = stored(client, pdf_bytes("one"), "report.pdf")
    rotated = client.post(f"/operations/{first}/rotate", json={"pages": [1], "degrees": 90}).json()["output_filename"]
    second = stored(client, pdf_bytes("two"), "report.pdf")

    response = client.post("/files/zip", json={"names": [first, rotated, second, first]})

    assert response.status_code == 200 and response.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert sorted(archive.namelist()) == ["report (2).pdf", "report-rotate.pdf", "report.pdf"]
        assert pymupdf.open(stream=archive.read("report-rotate.pdf"), filetype="pdf")[0].rotation == 90


def test_zip_refuses_missing_files_and_empty_requests(client, pdf_storage):
    assert client.post("/files/zip", json={"names": ["nothing.pdf"]}).status_code == 404
    assert client.post("/files/zip", json={"names": []}).status_code == 422
