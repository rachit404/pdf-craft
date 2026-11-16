"""Part 10: power tools, text tokens and library search."""

import pymupdf

from test_foundation import clean_records, form_pdf_bytes, pdf_bytes, pdf_with_blanks, png_bytes, put  # noqa: F401


def stored(client, content, name):
    return put(client, content, name, "application/pdf")["name"]


def result_doc(client, response):
    assert response.status_code == 200, response.text
    name = response.json()["output_filename"]
    download = client.get(f"/files/{name}/download")
    assert download.status_code == 200
    return pymupdf.open(stream=download.content, filetype="pdf")


def test_remove_blank_pages(client, pdf_storage):
    name = stored(client, pdf_with_blanks(), "blanks.pdf")
    response = client.post(f"/tools/{name}/remove-blank-pages", json={})

    assert response.json()["pages_removed"] == 3
    document = result_doc(client, response)
    assert [page.get_text().strip() for page in document] == ["first", "second", "third"]


def test_blank_removal_refuses_when_every_page_is_blank(client, pdf_storage):
    with pymupdf.open() as document:
        document.new_page()
        document.new_page()
        name = stored(client, document.tobytes(), "empty.pdf")

    response = client.post(f"/tools/{name}/remove-blank-pages", json={})
    assert response.status_code == 422 and "blank" in response.json()["detail"]


def test_a_scanned_looking_page_with_an_image_is_not_blank(client, pdf_storage):
    with pymupdf.open() as document:
        document.new_page().insert_image(pymupdf.Rect(50, 50, 250, 250), stream=png_bytes())
        document.new_page()
        name = stored(client, document.tobytes(), "scan.pdf")

    assert client.post(f"/tools/{name}/remove-blank-pages", json={}).json()["pages_removed"] == 1


def test_form_fields_can_be_listed_filled_and_flattened(client, pdf_storage):
    name = stored(client, form_pdf_bytes(), "form.pdf")

    fields = client.get(f"/tools/{name}/form-fields").json()
    assert [field["name"] for field in fields] == ["full_name", "city"]

    filled = client.post(f"/tools/{name}/fill-form", json={"values": {"full_name": "Asha Rao"}})
    document = result_doc(client, filled)
    assert {w.field_name: w.field_value for w in document[0].widgets()}["full_name"] == "Asha Rao"

    flat = client.post(f"/tools/{name}/fill-form", json={"values": {"city": "Pune"}, "flatten": True})
    document = result_doc(client, flat)
    assert list(document[0].widgets() or []) == []
    assert "Pune" in document[0].get_text()


def test_filling_an_unknown_field_is_refused(client, pdf_storage):
    name = stored(client, form_pdf_bytes(), "form.pdf")

    response = client.post(f"/tools/{name}/fill-form", json={"values": {"nope": "x"}})
    assert response.status_code == 422 and "nope" in response.json()["detail"]


def test_metadata_is_changed_and_cleared(client, pdf_storage):
    name = stored(client, pdf_bytes("hello"), "a.pdf")

    first = result_doc(client, client.post(f"/tools/{name}/edit-metadata", json={"title": "Report", "author": "Asha"}))
    assert first.metadata["title"] == "Report" and first.metadata["author"] == "Asha"

    again = client.post(f"/tools/{name}/edit-metadata", json={"title": "", "keywords": "a, b"})
    second = result_doc(client, again)
    assert second.metadata["title"] == "" and second.metadata["keywords"] == "a, b"

    assert client.post(f"/tools/{name}/edit-metadata", json={}).status_code == 422


def test_compress_to_target_reports_whether_it_fit(client, pdf_storage):
    name = stored(client, pdf_bytes("hello"), "a.pdf")

    fits = client.post(f"/tools/{name}/compress-to-target", json={"target_mb": 5}).json()
    assert fits["target_met"] is True and fits["level"] == "lossless"

    impossible = client.post(f"/tools/{name}/compress-to-target", json={"target_mb": 0.0001}).json()
    assert impossible["target_met"] is False


def test_text_tokens_are_filled_per_page(client, pdf_storage):
    name = stored(client, pdf_bytes("one", "two"), "a.pdf")

    document = result_doc(client, client.post(f"/operations/{name}/header-footer", json={"footer": "Page {page} of {pages}"}))
    assert "Page 1 of 2" in document[0].get_text()
    assert "Page 2 of 2" in document[1].get_text()

    stamped = result_doc(client, client.post(f"/operations/{name}/add-text", json={"text": "No. {page}", "x": 100, "y": 200}))
    assert "No. 2" in stamped[1].get_text()


def test_library_search_finds_words_with_page_and_context(client, pdf_storage):
    stored(client, pdf_bytes("invoice number 4711", "unrelated"), "invoice.pdf")
    stored(client, pdf_bytes("nothing here"), "other.pdf")

    found = client.get("/files/search", params={"q": "NUMBER 47"}).json()

    assert found["files_searched"] == 2 and found["complete"] is True
    assert [(hit["original_name"], hit["page"]) for hit in found["hits"]] == [("invoice.pdf", 1)]
    assert "4711" in found["hits"][0]["snippet"]
    assert client.get("/files/search", params={"q": "x"}).status_code == 422


# ---------------------------------------------------------
# Flow step cache
# ---------------------------------------------------------

def run_and_wait(client, definition, inputs):
    import time

    started = client.post("/flows/runs", json={"definition": definition, "inputs": inputs})
    assert started.status_code == 202, started.text
    run_id = started.json()["id"]

    for _ in range(100):
        run = client.get(f"/flows/runs/{run_id}").json()

        if run["status"] in ("done", "failed", "cancelled"):
            return run

        time.sleep(0.1)

    raise AssertionError("run did not finish")


def one_step_flow(op, **params):
    return {
        "nodes": [{"id": "in", "op": "source"}, {"id": "s", "op": op, "params": params}, {"id": "out", "op": "output"}],
        "edges": [{"source": "in", "target": "s"}, {"source": "s", "target": "out"}],
    }


def test_a_repeated_step_reuses_its_files(client, pdf_storage):
    name = stored(client, pdf_bytes("one", "two"), "a.pdf")
    flow = one_step_flow("rotate", pages=[1], degrees=90)

    first = run_and_wait(client, flow, {"in": [name]})
    second = run_and_wait(client, flow, {"in": [name]})

    assert first["status"] == second["status"] == "done"
    assert "cached" not in first["node_states"]["s"]
    assert second["node_states"]["s"]["cached"] is True
    assert first["outputs"] == second["outputs"]

    different = run_and_wait(client, one_step_flow("rotate", pages=[2], degrees=90), {"in": [name]})
    assert "cached" not in different["node_states"]["s"] and different["outputs"] != first["outputs"]


def test_cache_is_skipped_for_text_with_a_date_and_when_files_are_gone(client, pdf_storage):
    name = stored(client, pdf_bytes("one"), "a.pdf")
    dated = one_step_flow("header_footer", footer="{date}")

    run_and_wait(client, dated, {"in": [name]})
    assert "cached" not in run_and_wait(client, dated, {"in": [name]})["node_states"]["s"]

    plain = one_step_flow("rotate", pages=[1], degrees=90)
    first = run_and_wait(client, plain, {"in": [name]})
    assert client.delete(f"/files/{first['outputs'][0]}").status_code == 200

    again = run_and_wait(client, plain, {"in": [name]})
    assert again["status"] == "done" and "cached" not in again["node_states"]["s"]


# ---------------------------------------------------------
# Stamp, greyscale, compare
# ---------------------------------------------------------

def test_a_stamp_is_drawn_with_tokens_on_chosen_pages(client, pdf_storage):
    name = stored(client, pdf_bytes("one", "two"), "a.pdf")

    document = result_doc(client, client.post(f"/tools/{name}/stamp", json={"text": "DRAFT p{page}", "pages": [2]}))
    assert "DRAFT" not in document[0].get_text()
    assert "DRAFT p2" in document[1].get_text()

    assert client.post(f"/tools/{name}/stamp", json={"text": "x", "color": "red"}).status_code == 422
    assert client.post(f"/tools/{name}/stamp", json={"text": "\u0928\u092e\u0938\u094d\u0924\u0947"}).status_code == 422


def test_greyscale_removes_colour_but_keeps_text(client, pdf_storage):
    with pymupdf.open() as source:
        page = source.new_page(width=200, height=200)
        page.draw_rect(pymupdf.Rect(0, 0, 200, 200), fill=(0, 0, 1))
        page.insert_text((20, 100), "hello", color=(1, 1, 1))
        name = stored(client, source.tobytes(), "blue.pdf")

    document = result_doc(client, client.post(f"/tools/{name}/to-grayscale"))
    red, green, blue = document[0].get_pixmap(dpi=20).pixel(2, 2)

    assert red == green == blue
    assert "hello" in document[0].get_text()


def test_compare_lists_changed_pages_and_lines(client, pdf_storage):
    first = stored(client, pdf_bytes("price 10", "same", "only here"), "v1.pdf")
    second = stored(client, pdf_bytes("price 12", "same"), "v2.pdf")

    result = client.post("/tools/compare", json={"first": first, "second": second}).json()

    assert result["identical"] is False and (result["pages_first"], result["pages_second"]) == (3, 2)
    assert [change["page"] for change in result["changes"]] == [1, 3]
    assert result["changes"][0]["removed"] == ["price 10"] and result["changes"][0]["added"] == ["price 12"]
    assert result["changes"][1]["only_in"] == "first"

    same = client.post("/tools/compare", json={"first": first, "second": first}).json()
    assert same["identical"] is True and same["changes"] == []
