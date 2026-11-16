"""Part 6: file store with lineage, operation registry and the flow engine."""

import json
import time
from io import BytesIO
from pathlib import Path

import pymupdf
import pytest
from docx import Document
from PIL import Image
from pptx import Presentation

from app import registry
from app.flows import executor, runs
from app.flows.definition import FlowDefinition
from app.services import file_store, retention


@pytest.fixture(autouse=True)
def clean_records():
    """Every test starts with an empty file library and no runs."""
    from sqlalchemy import delete

    from app.db.init_db import create_schema
    from app.db.models import FlowRun, PDFJob, StoredFile
    from app.db.session import SessionLocal

    create_schema()

    with SessionLocal() as db:
        for table in (StoredFile, FlowRun, PDFJob):
            db.execute(delete(table))

        db.commit()


# ---------------------------------------------------------
# Sample files
# ---------------------------------------------------------

def pdf_bytes(*texts: str) -> bytes:
    with pymupdf.open() as document:
        for text in texts:
            document.new_page(width=300, height=400).insert_text((40, 80), text)

        return document.tobytes()


def png_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (60, 30), (200, 40, 40)).save(buffer, format="PNG")
    return buffer.getvalue()


def docx_bytes() -> bytes:
    buffer = BytesIO()
    document = Document()
    document.add_paragraph("Hello from Word")
    document.save(buffer)
    return buffer.getvalue()


def pptx_bytes() -> bytes:
    buffer = BytesIO()
    Presentation().save(buffer)
    return buffer.getvalue()


def put(client, content: bytes, name: str, kind: str = "application/octet-stream") -> dict:
    response = client.post("/files", files={"file": (name, content, kind)})
    assert response.status_code == 201, response.text
    return response.json()


def pages_of(storage_dirs, name: str) -> list[str]:
    for folder in storage_dirs:
        if (folder / name).is_file():
            with pymupdf.open(folder / name) as document:
                return [page.get_text().strip() for page in document]

    raise AssertionError(f"{name} not found")


# ---------------------------------------------------------
# File library
# ---------------------------------------------------------

@pytest.mark.parametrize(
    ("content", "name", "kind", "extension"),
    [
        (pdf_bytes("a"), "doc.pdf", "pdf", ".pdf"),
        (png_bytes(), "logo.png", "image", ".png"),
        (docx_bytes(), "letter.docx", "docx", ".docx"),
        (pptx_bytes(), "deck.pptx", "pptx", ".pptx"),
    ],
    ids=["pdf", "png", "docx", "pptx"],
)
def test_upload_reads_the_kind_from_the_content(client, pdf_storage, content, name, kind, extension):
    # The name given by the client is only a label: the content decides.
    record = put(client, content, "renamed.bin")

    assert (record["kind"], record["original_name"]) == (kind, "renamed.bin")
    assert record["name"].endswith(extension)
    assert (pdf_storage[0] / record["name"]).is_file()
    assert record["size_bytes"] == len(content)
    assert record["parent_name"] is None and record["root_name"] == record["name"]


@pytest.mark.parametrize(
    ("content", "status"),
    [(b"", 400), (b"plain text", 415), (b"PK\x03\x04not really a zip", 415)],
)
def test_upload_rejects_unsupported_content(client, pdf_storage, content, status):
    response = client.post("/files", files={"file": ("x.pdf", content, "application/pdf")})

    assert response.status_code == status
    assert list(pdf_storage[0].iterdir()) == []


def test_upload_rejects_unsupported_archives_and_big_files(client, pdf_storage, monkeypatch):
    import zipfile

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("xl/workbook.xml", "<x/>")
        archive.writestr("[Content_Types].xml", "<x/>")

    assert client.post("/files", files={"file": ("b.xlsx", buffer.getvalue())}).status_code == 415

    import app.api.routers.files as files_router

    monkeypatch.setattr(files_router, "MAX_UPLOAD_BYTES", 100)
    assert client.post("/files", files={"file": ("b.pdf", pdf_bytes("x" * 200))}).status_code == 413
    assert list(pdf_storage[0].iterdir()) == []


def test_results_are_chainable_and_form_a_version_history(client, pdf_storage):
    first = put(client, pdf_bytes("one", "two"), "contract.pdf")

    rotated = client.post(
        f"/operations/{first['name']}/rotate", json={"pages": [1], "degrees": 90}
    ).json()["output_filename"]

    # A result is a valid input: no download and upload in between.
    marked = client.post(
        f"/operations/{rotated}/watermark", json={"text": "DRAFT"}
    ).json()["output_filename"]

    family = client.get(f"/files/{marked}/versions").json()

    assert [item["name"] for item in family] == [first["name"], rotated, marked]
    assert [item["operation"] for item in family] == [None, "rotate", "watermark"]
    assert {item["root_name"] for item in family} == {first["name"]}
    assert family[2]["parent_name"] == rotated
    assert {item["original_name"] for item in family} == {"contract.pdf"}


def test_versions_follow_one_path_and_the_family_shows_every_branch(client, pdf_storage):
    root = put(client, pdf_bytes("one", "two"), "doc.pdf")["name"]
    rotated = client.post(f"/operations/{root}/rotate", json={"pages": [1], "degrees": 90}).json()["output_filename"]
    marked = client.post(f"/operations/{root}/watermark", json={"text": "X"}).json()["output_filename"]
    deeper = client.post(f"/operations/{marked}/page_numbers".replace("_", "-"), json={}).json()["output_filename"]

    names = lambda path: [f["name"] for f in client.get(path).json()]  # noqa: E731

    assert names(f"/files/{deeper}/versions") == [root, marked, deeper]  # not the rotated branch
    assert names(f"/files/{root}/versions") == [root]
    assert set(names(f"/files/{deeper}/family")) == {root, rotated, marked, deeper}
    assert client.get("/files/ghost.pdf/versions").status_code == 404
    assert client.get("/files/ghost.pdf/family").status_code == 404


def test_results_can_be_inspected_and_previewed(client, pdf_storage):
    first = put(client, pdf_bytes("one"), "a.pdf")
    result = client.post(f"/operations/{first['name']}/rotate", json={"pages": [1], "degrees": 90}).json()["output_filename"]

    assert client.get(f"/uploads/{result}/info").json()["page_count"] == 1
    assert client.get(f"/uploads/{result}/pages/1/preview").status_code == 200
    assert client.get(f"/uploads/{result}/text").status_code == 200


def test_merge_records_every_source(client, pdf_storage):
    a, b = put(client, pdf_bytes("a"), "a.pdf"), put(client, pdf_bytes("b"), "b.pdf")
    merged = client.post("/operations/merge", json={"filenames": [a["name"], b["name"]]}).json()["output_filename"]

    record = client.get(f"/files/{merged}").json()

    assert record["sources"] == [a["name"], b["name"]]
    assert record["parent_name"] == a["name"]


def test_listing_filters_and_hides_flow_scratch_files(client, pdf_storage):
    put(client, pdf_bytes("a"), "a.pdf")
    put(client, png_bytes(), "p.png")
    file_store.register("hidden.pdf", kind="pdf", original_name="x.pdf", intermediate=True)

    names = lambda **q: {f["original_name"] for f in client.get("/files", params=q).json()}  # noqa: E731

    assert names() == {"a.pdf", "p.png"}
    assert names(kind="image") == {"p.png"}
    assert "x.pdf" in names(include_intermediate=True)


def test_expiry_follows_the_retention_setting(client, pdf_storage, monkeypatch):
    first = put(client, pdf_bytes("a"), "a.pdf")
    assert first["expires_at"] is None  # tests run with retention 0 (keep)

    monkeypatch.setenv("PDF_CRAFT_RETENTION_HOURS", "2")
    record = client.get(f"/files/{first['name']}").json()

    from datetime import datetime

    gap = datetime.fromisoformat(record["expires_at"]) - datetime.fromisoformat(record["created_at"])
    assert gap.total_seconds() == 2 * 3600


def test_download_names_and_missing_files(client, pdf_storage):
    first = put(client, pdf_bytes("a"), "contract.pdf")
    result = client.post(f"/operations/{first['name']}/rotate", json={"pages": [1], "degrees": 90}).json()["output_filename"]

    def disposition(file, **params):
        from urllib.parse import unquote

        response = client.get(f"/files/{file}/download", params=params)
        assert response.status_code == 200
        return unquote(response.headers["content-disposition"])

    assert "contract.pdf" in disposition(first["name"])
    assert "contract-rotate.pdf" in disposition(result)
    assert "Final copy.pdf" in disposition(result, name="Final copy")

    assert client.get("/files/missing.pdf/download").status_code == 404
    assert client.get("/files/..%2Fsecret.pdf/download").status_code in (404, 422)


def test_delete_removes_the_file_and_its_records(client, pdf_storage):
    first = put(client, pdf_bytes("a"), "a.pdf")
    result = client.post(f"/operations/{first['name']}/rotate", json={"pages": [1], "degrees": 90}).json()["output_filename"]

    assert client.delete(f"/files/{result}").status_code == 200
    assert not (pdf_storage[1] / result).exists()
    assert client.get(f"/files/{result}").status_code == 404
    assert all(job["output_filename"] != result for job in client.get("/jobs").json())
    assert client.delete(f"/files/{result}").status_code == 404
    assert (pdf_storage[0] / first["name"]).is_file()  # the source stays


def test_locate_only_accepts_plain_names(pdf_storage):
    (pdf_storage[0] / "ok.pdf").write_bytes(pdf_bytes("a"))

    assert file_store.locate("ok.pdf") is not None
    for bad in ("../ok.pdf", "..\\ok.pdf", "/etc/passwd", ".hidden.pdf", "", "sub/ok.pdf"):
        assert file_store.locate(bad) is None


def test_sweep_forgets_deleted_files(client, pdf_storage):
    import os

    first = put(client, pdf_bytes("a"), "a.pdf")
    path = pdf_storage[0] / first["name"]
    old = time.time() - 48 * 3600
    os.utime(path, (old, old))

    assert retention.sweep(24 * 3600) == 1
    assert client.get(f"/files/{first['name']}").status_code == 404


# ---------------------------------------------------------
# Registry
# ---------------------------------------------------------

def test_registry_lists_every_operation_with_a_schema(client):
    operations = client.get("/registry/operations").json()
    ids = [operation["id"] for operation in operations]

    assert len(ids) == len(set(ids)) == 26
    assert {"merge", "split", "rotate", "watermark", "compress", "protect", "redact", "to_docx", "images_to_pdf"} <= set(ids)

    for operation in operations:
        assert operation["inputs"] and operation["output"] in {"pdf", "image", "docx", "xlsx", "pptx"}
        assert operation["params_schema"]["type"] == "object"
        json.dumps(operation)

    watermark = next(o for o in operations if o["id"] == "watermark")
    assert "text" in watermark["params_schema"]["properties"]


@pytest.fixture
def samples(pdf_storage):
    """Real input files for every kind of port."""
    up = pdf_storage[0]
    (up / "three.pdf").write_bytes(pdf_bytes("one", "two", "three"))
    (up / "two.pdf").write_bytes(pdf_bytes("alpha", "beta"))
    (up / "logo.png").write_bytes(png_bytes())
    (up / "a.docx").write_bytes(docx_bytes())
    (up / "a.pptx").write_bytes(pptx_bytes())
    return up


REGISTRY_CASES = {
    "merge": ({"pdf": ["three.pdf", "two.pdf"]}, {}, ["pdf"], 5),
    "split": ({"pdf": ["three.pdf"]}, {"ranges": [[1, 1], [2, 3]]}, ["pdf", "pdf"], None),
    "extract_pages": ({"pdf": ["three.pdf"]}, {"pages": [1, 3]}, ["pdf"], 2),
    "reorder_pages": ({"pdf": ["two.pdf"]}, {"order": [2, 1]}, ["pdf"], 2),
    "delete_pages": ({"pdf": ["three.pdf"]}, {"pages": [2]}, ["pdf"], 2),
    "duplicate_pages": ({"pdf": ["two.pdf"]}, {"pages": [1]}, ["pdf"], 3),
    "rotate": ({"pdf": ["two.pdf"]}, {"pages": [1], "degrees": 90}, ["pdf"], 2),
    "watermark": ({"pdf": ["two.pdf"]}, {"text": "DRAFT"}, ["pdf"], 2),
    "page_numbers": ({"pdf": ["two.pdf"]}, {}, ["pdf"], 2),
    "header_footer": ({"pdf": ["two.pdf"]}, {"header": "Top"}, ["pdf"], 2),
    "background": ({"pdf": ["two.pdf"]}, {"red": 1, "green": 1, "blue": 0.8}, ["pdf"], 2),
    "crop": ({"pdf": ["two.pdf"]}, {"left": 10, "bottom": 10, "right": 10, "top": 10}, ["pdf"], 2),
    "add_text": ({"pdf": ["two.pdf"]}, {"text": "Hi", "x": 20, "y": 20}, ["pdf"], 2),
    "add_image": ({"pdf": ["two.pdf"], "image": ["logo.png"]}, {"x": 10, "y": 10, "width": 60, "height": 30}, ["pdf"], 2),
    "compress": ({"pdf": ["two.pdf"]}, {}, ["pdf"], 2),
    "protect": ({"pdf": ["two.pdf"]}, {"user_password": "secret-pw"}, ["pdf"], None),
    "redact": ({"pdf": ["two.pdf"]}, {"terms": ["alpha"]}, ["pdf"], 2),
    "sanitize": ({"pdf": ["two.pdf"]}, {}, ["pdf"], 2),
    "unlock": ({"pdf": ["two.pdf"]}, {"password": ""}, ["pdf"], 2),
    "to_images": ({"pdf": ["three.pdf"]}, {"dpi": 50}, ["png", "png", "png"], None),
    "to_docx": ({"pdf": ["two.pdf"]}, {}, ["docx"], None),
    "to_xlsx": ({"pdf": ["two.pdf"]}, {}, ["xlsx"], None),
    "to_pptx": ({"pdf": ["two.pdf"]}, {"dpi": 50}, ["pptx"], None),
    "images_to_pdf": ({"image": ["logo.png", "logo.png"]}, {}, ["pdf"], 2),
    "docx_to_pdf": ({"docx": ["a.docx"]}, {}, ["pdf"], 1),
    "pptx_to_pdf": ({"pptx": ["a.pptx"]}, {}, ["pdf"], None),
}


def test_every_registered_operation_is_exercised():
    assert set(REGISTRY_CASES) == {op.id for op in registry.all_operations()}


@pytest.mark.parametrize("operation_id", sorted(REGISTRY_CASES))
def test_each_operation_runs_and_produces_its_declared_files(samples, pdf_storage, operation_id):
    inputs, settings, suffixes, pages = REGISTRY_CASES[operation_id]
    operation = registry.get(operation_id)
    files = {port: [samples / name for name in names] for port, names in inputs.items()}

    produced = operation.run(files, operation.params.model_validate(settings))

    assert [p.suffix.lstrip(".") for p in produced] == suffixes
    assert all(p.is_file() and p.stat().st_size > 0 for p in produced)
    assert all(p.parent == pdf_storage[1] for p in produced)  # stored with the results
    assert operation.many_outputs == (len(produced) > 1 or operation_id in ("split", "to_images"))

    if pages is not None:
        assert len(pymupdf.open(produced[0])) == pages


def test_operations_match_what_the_endpoints_produce(client, samples, pdf_storage):
    endpoint = client.post("/operations/three.pdf/rotate", json={"pages": [2], "degrees": 90}).json()["output_filename"]
    operation = registry.get("rotate")
    produced = operation.run({"pdf": [samples / "three.pdf"]}, operation.params.model_validate({"pages": [2], "degrees": 90}))[0]

    rotations = lambda p: [page.rotation for page in pymupdf.open(p)]  # noqa: E731
    assert rotations(pdf_storage[1] / endpoint) == rotations(produced) == [0, 90, 0]


# ---------------------------------------------------------
# Flow definitions
# ---------------------------------------------------------

def flow(nodes, edges):
    return {"nodes": nodes, "edges": edges}


def src(node_id="in"):
    return {"id": node_id, "op": "source"}


def step(node_id, op, **params):
    return {"id": node_id, "op": op, "params": params}


def link(a, b, port=None):
    return {"source": a, "target": b, **({"port": port} if port else {})}


def issues_for(client, definition) -> list[str]:
    response = client.post("/flows/validate", json=definition)
    assert response.status_code == 200
    return [issue["message"] for issue in response.json()["issues"]]


def test_a_valid_flow_has_no_issues(client):
    definition = flow(
        [src(), step("m", "merge"), step("r", "rotate", pages=[1], degrees=90), {"id": "out", "op": "output"}],
        [link("in", "m"), link("m", "r"), link("r", "out")],
    )

    assert issues_for(client, definition) == []


@pytest.mark.parametrize(
    ("definition", "expected"),
    [
        (flow([src(), step("x", "nonsense")], [link("in", "x")]), "Unknown step"),
        (flow([src(), step("w", "watermark")], [link("in", "w")]), "text"),  # missing required setting
        (flow([src(), step("r", "rotate", pages=[1], degrees=90)], []), "needs something connected"),
        (flow([src(), step("a", "rotate", pages=[1], degrees=90), step("b", "rotate", pages=[1], degrees=90)], [link("in", "a"), link("a", "b"), link("b", "a")]), "loop"),
        (flow([step("r", "merge")], []), "at least one source"),
        (flow([src(), step("d", "to_docx"), step("m", "merge")], [link("in", "d"), link("d", "m")]), "needs pdf files but"),
        (flow([src(), step("r", "rotate", pages=[1], degrees=90)], [link("in", "r"), link("r", "ghost")]), "does not exist"),
        (flow([src(), src("in2")], [link("in", "in2")]), "cannot receive"),
        (flow([src(), {"id": "o", "op": "output"}, step("r", "rotate", pages=[1], degrees=90)], [link("in", "o"), link("o", "r")]), "Nothing can follow"),
        (flow([src(), step("i", "add_image", x=1, y=1, width=5, height=5)], [link("in", "i")]), "Image input"),
        (flow([src(), step("r", "rotate", pages=[1], degrees=90)], [link("in", "r", "nope")]), "no input called"),
        (flow([src(), src()], []), "share the same id"),
    ],
)
def test_validation_explains_what_is_wrong(client, definition, expected):
    messages = issues_for(client, definition)

    assert any(expected.lower() in message.lower() for message in messages), messages


def test_too_many_steps_are_refused(client):
    nodes = [src()] + [step(f"s{i}", "compress") for i in range(30)]

    assert client.post("/flows/validate", json=flow(nodes, [])).status_code == 422


# ---------------------------------------------------------
# Running flows
# ---------------------------------------------------------

def start(client, definition, inputs) -> dict:
    response = client.post("/flows/runs", json={"definition": definition, "inputs": inputs})
    assert response.status_code == 202, response.text
    return client.get(f"/flows/runs/{response.json()['id']}").json()  # background task already ran


def test_a_chain_runs_end_to_end_without_downloading_anything(client, pdf_storage):
    a, b = put(client, pdf_bytes("one"), "a.pdf"), put(client, pdf_bytes("two", "three"), "b.pdf")
    definition = flow(
        [
            src(),
            step("m", "merge"),
            step("r", "rotate", pages=[1], degrees=90),
            step("w", "watermark", text="DRAFT"),
            {"id": "out", "op": "output"},
        ],
        [link("in", "m"), link("m", "r"), link("r", "w"), link("w", "out")],
    )

    run = start(client, definition, {"in": [a["name"], b["name"]]})

    assert run["status"] == "done", run
    assert {state["status"] for state in run["node_states"].values()} == {"done"}
    assert len(run["outputs"]) == 1

    final = run["outputs"][0]
    with pymupdf.open(pdf_storage[1] / final) as document:
        assert len(document) == 3
        assert document[0].rotation == 90
        assert "DRAFT" in document[1].get_text()

    # Only the result is listed; the steps in between are hidden but recorded.
    listed = {f["name"] for f in client.get("/files").json()}
    assert final in listed and len(listed) == 3  # a, b and the result
    everything = client.get("/files", params={"include_intermediate": True}).json()
    assert len(everything) == 5  # a, b and one file per step

    record = client.get(f"/files/{final}").json()
    assert record["operation"] == "watermark" and record["intermediate"] is False
    assert run["files"][0]["name"] == final


def test_each_mode_runs_per_file_and_combine_mode_runs_once(client, pdf_storage):
    a, b = put(client, pdf_bytes("one"), "a.pdf"), put(client, pdf_bytes("two", "three"), "b.pdf")
    per_file = flow(
        [src(), step("r", "rotate", pages=[1], degrees=90), {"id": "out", "op": "output"}],
        [link("in", "r"), link("r", "out")],
    )

    run = start(client, per_file, {"in": [a["name"], b["name"]]})
    assert [len(pymupdf.open(pdf_storage[1] / n)) for n in run["outputs"]] == [1, 2]
    assert all(pymupdf.open(pdf_storage[1] / n)[0].rotation == 90 for n in run["outputs"])

    combined = flow(
        [src(), step("r", "rotate", pages=[1], degrees=90), step("m", "merge")],
        [link("in", "r"), link("r", "m")],
    )
    run = start(client, combined, {"in": [a["name"], b["name"]]})
    assert len(run["outputs"]) == 1 and len(pymupdf.open(pdf_storage[1] / run["outputs"][0])) == 3


def test_split_then_per_file_steps_then_merge(client, pdf_storage):
    doc = put(client, pdf_bytes("one", "two", "three"), "doc.pdf")
    definition = flow(
        [src(), step("s", "split", ranges=[[1, 1], [2, 3]]), step("w", "watermark", text="COPY"), step("m", "merge")],
        [link("in", "s"), link("s", "w"), link("w", "m")],
    )

    run = start(client, definition, {"in": [doc["name"]]})

    assert run["status"] == "done", run
    assert run["node_states"]["s"]["items"].__len__() == 2  # two PDFs came out of the split
    texts = pages_of([pdf_storage[1]], run["outputs"][0])
    assert len(texts) == 3 and all("COPY" in text for text in texts)


def test_a_fork_produces_results_of_different_kinds(client, pdf_storage):
    doc = put(client, pdf_bytes("one", "two"), "doc.pdf")
    definition = flow(
        [src(), step("c", "compress"), step("w", "to_docx")],
        [link("in", "c"), link("in", "w")],
    )

    run = start(client, definition, {"in": [doc["name"]]})

    assert run["status"] == "done"
    assert sorted(f["kind"] for f in run["files"]) == ["docx", "pdf"]


def test_a_second_input_port_receives_its_own_files(client, pdf_storage):
    doc, logo = put(client, pdf_bytes("one"), "doc.pdf"), put(client, png_bytes(), "logo.png")
    definition = flow(
        [src("docs"), src("logos"), step("i", "add_image", x=10, y=10, width=60, height=30)],
        [link("docs", "i"), link("logos", "i", "image")],
    )

    run = start(client, definition, {"docs": [doc["name"]], "logos": [logo["name"]]})

    assert run["status"] == "done", run
    with pymupdf.open(pdf_storage[1] / run["outputs"][0]) as document:
        assert len(document[0].get_images()) == 1


def test_images_become_a_pdf_then_continue(client, pdf_storage):
    first, second = put(client, png_bytes(), "1.png"), put(client, png_bytes(), "2.png")
    definition = flow(
        [src(), step("p", "images_to_pdf"), step("n", "page_numbers")],
        [link("in", "p"), link("p", "n")],
    )

    run = start(client, definition, {"in": [first["name"], second["name"]]})

    assert run["status"] == "done" and len(pymupdf.open(pdf_storage[1] / run["outputs"][0])) == 2


def test_a_failing_step_stops_its_branch_but_not_the_others(client, pdf_storage):
    doc = put(client, pdf_bytes("one", "two"), "doc.pdf")
    definition = flow(
        [src(), step("u", "unlock", password="wrong"), step("after", "compress"), step("ok", "compress")],
        [link("in", "u"), link("u", "after"), link("in", "ok")],
    )

    # Unlocking a file that has no password just copies it, so lock it first.
    locked = client.post(f"/security/{doc['name']}/protect", json={"user_password": "right-pw"}).json()["output_filename"]
    run = start(client, definition, {"in": [locked]})

    states = {node: state["status"] for node, state in run["node_states"].items()}
    assert run["status"] == "failed"
    assert states["u"] == "error" and states["after"] == "skipped"
    assert "Incorrect" in run["node_states"]["u"]["error"]
    assert run["error"] == run["node_states"]["u"]["error"]


@pytest.mark.parametrize(
    ("inputs", "message"),
    [
        ({"in": []}, "no files"),
        ({"in": ["ghost.pdf"]}, "not found"),
    ],
)
def test_missing_inputs_are_reported_on_the_source_step(client, pdf_storage, inputs, message):
    definition = flow([src(), step("c", "compress")], [link("in", "c")])

    run = start(client, definition, inputs)

    assert run["status"] == "failed" and message in run["node_states"]["in"]["error"]
    assert run["node_states"]["c"]["status"] == "skipped"


def test_a_file_of_the_wrong_kind_is_explained(client, pdf_storage):
    logo = put(client, png_bytes(), "logo.png")
    definition = flow([src(), step("r", "rotate", pages=[1], degrees=90)], [link("in", "r")])

    run = start(client, definition, {"in": [logo["name"]]})

    assert run["status"] == "failed"
    assert "needs pdf files, but received image" in run["node_states"]["r"]["error"]


def test_passwords_are_never_stored(client, pdf_storage):
    doc = put(client, pdf_bytes("one"), "doc.pdf")
    definition = flow([src(), step("p", "protect", user_password="hunter2-secret", owner_password="owner-secret")], [link("in", "p")])

    run = start(client, definition, {"in": [doc["name"]]})

    assert run["status"] == "done"
    node = next(n for n in run["definition"]["nodes"] if n["id"] == "p")
    assert node["params"]["user_password"] == "***" and node["params"]["owner_password"] == "***"

    for listing in (client.get("/flows/runs").text, client.get(f"/flows/runs/{run['id']}").text):
        assert "hunter2-secret" not in listing and "owner-secret" not in listing

    # The protection itself used the real password.
    with pymupdf.open(pdf_storage[1] / run["outputs"][0]) as locked:
        assert locked.authenticate("hunter2-secret")


def test_invalid_flows_are_refused_before_running(client):
    response = client.post("/flows/runs", json={"definition": flow([src()], [link("in", "ghost")]), "inputs": {}})

    assert response.status_code == 422
    assert response.json()["detail"]["issues"]


def test_runs_can_be_listed_found_and_deleted(client, pdf_storage):
    doc = put(client, pdf_bytes("one"), "doc.pdf")
    run = start(client, flow([src(), step("c", "compress")], [link("in", "c")]), {"in": [doc["name"]]})

    assert run["id"] in [r["id"] for r in client.get("/flows/runs").json()]
    assert client.get("/flows/runs/nope").status_code == 404
    assert client.post(f"/flows/runs/{run['id']}/cancel").json()["cancelling"] is False  # already finished
    assert client.delete(f"/flows/runs/{run['id']}").status_code == 200
    assert client.get(f"/flows/runs/{run['id']}").status_code == 404
    assert client.delete(f"/flows/runs/{run['id']}").status_code == 404


def test_interrupted_runs_are_closed_after_a_restart(client):
    run_id = runs.create("local", {"nodes": [], "edges": []}, {})
    runs.update(run_id, status="running")

    runs.fail_interrupted()

    run = runs.get(run_id, "local")
    assert run["status"] == "failed" and "restarted" in run["error"]


def test_old_finished_runs_are_pruned(client):
    old, fresh = runs.create("local", {}, {}), runs.create("local", {}, {})
    runs.update(old, status="done")
    runs.update(fresh, status="done")

    runs.prune(time.time() + 3600)  # everything finished before "an hour from now"
    assert runs.get(old, "local") is None and runs.get(fresh, "local") is None


# ---------------------------------------------------------
# Engine behaviour that the API cannot reach easily
# ---------------------------------------------------------

def run_engine(definition, inputs, **kwargs):
    return executor.run_flow(FlowDefinition.model_validate(definition), inputs, **kwargs)


def test_cancelling_stops_the_remaining_steps(pdf_storage):
    (pdf_storage[0] / "a.pdf").write_bytes(pdf_bytes("one"))
    definition = flow(
        [src(), step("c", "compress"), step("r", "rotate", pages=[1], degrees=90)],
        [link("in", "c"), link("c", "r")],
    )
    seen = []

    # Cancel as soon as the first step reports it has finished.
    result = run_engine(
        definition, {"in": ["a.pdf"]},
        progress=lambda states: seen.append(states["in"]["status"]),
        cancelled=lambda: "done" in seen,
    )

    assert result.status == "cancelled"
    assert result.node_states["c"]["status"] == "cancelled" and result.node_states["r"]["status"] == "cancelled"


def test_the_item_limit_protects_the_server(pdf_storage, monkeypatch):
    for name in ("a.pdf", "b.pdf", "c.pdf"):
        (pdf_storage[0] / name).write_bytes(pdf_bytes("x"))

    monkeypatch.setattr(executor, "MAX_ITEMS_PER_STEP", 2)
    result = run_engine(flow([src()], []), {"in": ["a.pdf", "b.pdf", "c.pdf"]})

    assert result.status == "failed" and "more than 2 files" in result.error


def test_the_time_limit_stops_a_long_run(pdf_storage, monkeypatch):
    (pdf_storage[0] / "a.pdf").write_bytes(pdf_bytes("x"))
    monkeypatch.setattr(executor, "time_limit", lambda: -1.0)

    result = run_engine(flow([src(), step("c", "compress")], [link("in", "c")]), {"in": ["a.pdf"]})

    assert result.status == "failed" and "time limit" in result.error


def test_results_are_registered_with_lineage(pdf_storage):
    (pdf_storage[0] / "a.pdf").write_bytes(pdf_bytes("x"))
    file_store.register("a.pdf", kind="pdf", original_name="report.pdf")

    result = run_engine(flow([src(), step("c", "compress")], [link("in", "c")]), {"in": ["a.pdf"]})
    record = file_store.get(result.outputs[0])

    assert (record["operation"], record["parent_name"], record["root_name"]) == ("compress", "a.pdf", "a.pdf")
    assert record["original_name"] == "report.pdf" and record["kind"] == "pdf"
    assert record["intermediate"] is False
