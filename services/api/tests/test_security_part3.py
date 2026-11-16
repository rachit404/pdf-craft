"""Behavioural tests for Protect, Unlock, Redact and Sanitize."""

from pathlib import Path

import pymupdf
import pytest
from PIL import Image
from pypdf import PdfReader, PdfWriter
from pypdf.constants import UserAccessPermissions

from app.engines.pdf.security import (
    protect_pdf,
    redact_pdf,
    sanitize_pdf,
    unlock_pdf,
)


def make_pdf(path: Path, pages=("Hello SECRET world",), title=None) -> Path:
    document = pymupdf.open()

    for text in pages:
        document.new_page(width=300, height=400).insert_text((40, 80), text, fontsize=14)

    if title:
        document.set_metadata({"title": title, "author": "Jane Doe"})

    document.save(path)
    document.close()
    return path


def raw_streams_contain(path: Path, needle: bytes) -> bool:
    """Search every stream for the text, as plain bytes or as PyMuPDF's hex strings."""
    forms = (needle, needle.hex().encode())

    with pymupdf.open(path) as document:
        return any(
            form in document.xref_stream(xref)
            for xref in range(1, document.xref_length())
            if document.xref_is_stream(xref)
            for form in forms
        )


@pytest.fixture
def pdf(tmp_path):
    return make_pdf(tmp_path / "in.pdf", title="Quarterly Plan")


# ---------------------------------------------------------
# Protect
# ---------------------------------------------------------

def protect(pdf, tmp_path, owner=None, **permissions):
    flags = {
        "allow_printing": False,
        "allow_copying": False,
        "allow_modifying": False,
        "allow_annotations": False,
        **permissions,
    }
    output = tmp_path / "protected.pdf"
    protect_pdf(pdf, output, "user-pw", owner, **flags)
    return output


def test_protect_requires_the_password_and_uses_aes_256(pdf, tmp_path):
    output = protect(pdf, tmp_path)

    with pymupdf.open(output) as document:
        assert document.needs_pass
        assert not document.authenticate("wrong")
        assert document.authenticate("user-pw")
        assert "256" in document.metadata["encryption"]


def test_restrictions_apply_even_without_an_owner_password(pdf, tmp_path):
    output = protect(pdf, tmp_path)  # everything disallowed, no owner password

    with pymupdf.open(output) as document:
        document.authenticate("user-pw")
        assert not document.permissions & pymupdf.PDF_PERM_PRINT
        assert not document.permissions & pymupdf.PDF_PERM_COPY
        assert not document.permissions & pymupdf.PDF_PERM_MODIFY
        assert not document.permissions & pymupdf.PDF_PERM_ANNOTATE


def test_allowed_permissions_are_granted(pdf, tmp_path):
    output = protect(pdf, tmp_path, allow_printing=True, allow_copying=True)

    with pymupdf.open(output) as document:
        document.authenticate("user-pw")
        assert document.permissions & pymupdf.PDF_PERM_PRINT
        assert document.permissions & pymupdf.PDF_PERM_COPY
        assert not document.permissions & pymupdf.PDF_PERM_MODIFY


def test_owner_password_gives_full_rights(pdf, tmp_path):
    output = protect(pdf, tmp_path, owner="owner-pw")

    with pymupdf.open(output) as document:
        document.authenticate("owner-pw")
        assert document.permissions & pymupdf.PDF_PERM_MODIFY


def test_protect_keeps_document_metadata(pdf, tmp_path):
    output = protect(pdf, tmp_path)

    with pymupdf.open(output) as document:
        document.authenticate("user-pw")
        assert document.metadata["title"] == "Quarterly Plan"


def test_protect_rejects_empty_password_and_encrypted_input(pdf, tmp_path):
    with pytest.raises(ValueError, match="password is required"):
        protect_pdf(pdf, tmp_path / "x.pdf", "", None, True, True, True, True)

    locked = protect(pdf, tmp_path)

    with pytest.raises(ValueError, match="Unlock"):
        protect_pdf(locked, tmp_path / "y.pdf", "pw", None, True, True, True, True)


# ---------------------------------------------------------
# Unlock
# ---------------------------------------------------------

def test_unlock_round_trip_keeps_content_and_metadata(pdf, tmp_path):
    locked = protect(pdf, tmp_path)
    output = tmp_path / "unlocked.pdf"

    result = unlock_pdf(locked, output, "user-pw")

    assert result["was_encrypted"] is True
    assert not PdfReader(str(output)).is_encrypted

    with pymupdf.open(output) as document:
        assert "SECRET" in document[0].get_text()
        assert document.metadata["title"] == "Quarterly Plan"
        assert document.permissions & pymupdf.PDF_PERM_PRINT  # restrictions gone


def test_unlock_rejects_wrong_password(pdf, tmp_path):
    locked = protect(pdf, tmp_path)

    with pytest.raises(ValueError, match="Incorrect"):
        unlock_pdf(locked, tmp_path / "out.pdf", "nope")

    assert not (tmp_path / "out.pdf").exists()


def test_unlock_removes_restrictions_without_a_password(tmp_path):
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.encrypt("", "owner-pw", permissions_flag=UserAccessPermissions(0))
    restricted = tmp_path / "restricted.pdf"
    with restricted.open("wb") as file:
        writer.write(file)

    result = unlock_pdf(restricted, tmp_path / "out.pdf", "")

    assert result["was_encrypted"] is True
    assert not PdfReader(str(tmp_path / "out.pdf")).is_encrypted


def test_unlock_reports_unprotected_pdf(pdf, tmp_path):
    result = unlock_pdf(pdf, tmp_path / "out.pdf", "")

    assert result["was_encrypted"] is False
    assert "not password protected" in result["message"]


# ---------------------------------------------------------
# Redact
# ---------------------------------------------------------

def test_redacting_an_area_removes_the_text_from_the_file(pdf, tmp_path):
    assert raw_streams_contain(pdf, b"SECRET")  # sanity: it is really there

    output = tmp_path / "out.pdf"
    redact_pdf(pdf, output, [{"page": 1, "x0": 30, "y0": 60, "x1": 250, "y1": 90}])

    assert not raw_streams_contain(output, b"SECRET")
    with pymupdf.open(output) as document:
        assert "SECRET" not in document[0].get_text()


def test_search_terms_redact_every_match_and_keep_other_text(tmp_path):
    source = make_pdf(
        tmp_path / "in.pdf",
        pages=["secret one and Secret two", "nothing here", "SECRET three"],
    )
    output = tmp_path / "out.pdf"

    result = redact_pdf(source, output, [], ["secret"])  # case-insensitive

    assert result["search_matches"] == 3
    assert not raw_streams_contain(output, b"SECRET")
    assert not raw_streams_contain(output, b"Secret")
    with pymupdf.open(output) as document:
        text = " ".join(page.get_text() for page in document)
    assert "nothing here" in text and "three" in text and "secret" not in text.lower()


def test_regions_and_terms_can_be_combined(tmp_path):
    source = make_pdf(tmp_path / "in.pdf", pages=["alpha SECRET beta"])
    output = tmp_path / "out.pdf"

    result = redact_pdf(
        source, output, [{"page": 1, "x0": 0, "y0": 0, "x1": 50, "y1": 20}], ["SECRET"]
    )

    assert (result["areas_redacted"], result["search_matches"]) == (1, 1)


def test_redaction_needs_a_target_and_a_match(pdf, tmp_path):
    with pytest.raises(ValueError, match="at least one"):
        redact_pdf(pdf, tmp_path / "a.pdf", [], [])

    with pytest.raises(ValueError, match="No text matching"):
        redact_pdf(pdf, tmp_path / "b.pdf", [], ["absent"])

    assert not (tmp_path / "a.pdf").exists() and not (tmp_path / "b.pdf").exists()


def test_regions_are_clamped_to_the_page_or_rejected(pdf, tmp_path):
    output = tmp_path / "out.pdf"
    redact_pdf(pdf, output, [{"page": 1, "x0": 30, "y0": 60, "x1": 9999, "y1": 9999}])
    assert not raw_streams_contain(output, b"SECRET")

    for region in (
        {"page": 1, "x0": 500, "y0": 500, "x1": 600, "y1": 600},
        {"page": 2, "x0": 0, "y0": 0, "x1": 10, "y1": 10},
    ):
        with pytest.raises(ValueError):
            redact_pdf(pdf, tmp_path / "bad.pdf", [region])


def test_rotated_pages_are_redacted_in_preview_coordinates(tmp_path):
    source = tmp_path / "rot.pdf"
    make_pdf(source)
    with pymupdf.open(source) as document:
        document[0].set_rotation(90)
        document.saveIncr()

    output = tmp_path / "out.pdf"
    redact_pdf(source, output, [], ["SECRET"])

    assert not raw_streams_contain(output, b"SECRET")
    with pymupdf.open(output) as document:
        assert document[0].rotation == 90


def test_images_under_a_redaction_are_blanked(tmp_path):
    image = tmp_path / "red.png"
    Image.new("RGB", (100, 100), (255, 0, 0)).save(image)
    source = tmp_path / "in.pdf"
    with pymupdf.open() as document:
        document.new_page(width=200, height=200).insert_image(
            pymupdf.Rect(0, 0, 100, 100), filename=str(image)
        )
        document.save(source)

    output = tmp_path / "out.pdf"
    redact_pdf(source, output, [{"page": 1, "x0": 0, "y0": 0, "x1": 50, "y1": 100}])

    with pymupdf.open(output) as document:
        pixmap = document[0].get_pixmap(dpi=72)

    assert pixmap.pixel(25, 50) == (0, 0, 0)  # redacted
    assert pixmap.pixel(75, 50) == (255, 0, 0)  # untouched


# ---------------------------------------------------------
# Sanitize
# ---------------------------------------------------------

@pytest.fixture
def dirty(tmp_path):
    path = tmp_path / "dirty.pdf"
    with pymupdf.open() as document:
        page = document.new_page(width=300, height=400)
        page.insert_text((40, 80), "Body text", fontsize=14)
        page.insert_link(
            {
                "kind": pymupdf.LINK_URI,
                "from": pymupdf.Rect(40, 60, 120, 90),
                "uri": "https://example.com",
            }
        )
        page.add_text_annot((200, 200), "private comment")
        document.embfile_add("secret.txt", b"attached data")
        document.set_metadata(
            {"title": "Internal", "author": "Jane Doe", "creator": "Word"}
        )
        document.xref_set_key(
            document.pdf_catalog(),
            "OpenAction",
            "<</S/JavaScript/JS(app.alert\\(1\\))>>",
        )
        document.save(path)
    return path


def test_sanitize_removes_private_and_unsafe_elements(dirty, tmp_path):
    output = tmp_path / "clean.pdf"
    result = sanitize_pdf(dirty, output)

    with pymupdf.open(output) as document:
        assert not any(document.metadata[key] for key in ("title", "author", "creator"))
        assert document.embfile_count() == 0
        assert document[0].get_links() == []
        assert list(document[0].annots() or []) == []
        assert document.xref_get_key(document.pdf_catalog(), "OpenAction")[0] == "null"
        assert "Body text" in document[0].get_text()  # content survives

    assert not raw_streams_contain(output, b"app.alert")
    assert result["metadata_removed"] is True
    assert (
        result["attachments_removed"],
        result["annotations_removed"],
        result["links_removed"],
    ) == (1, 1, 1)


def test_sanitize_options_can_keep_elements(dirty, tmp_path):
    output = tmp_path / "kept.pdf"
    sanitize_pdf(
        dirty, output, metadata=False, links=False, annotations=False, attachments=False
    )

    with pymupdf.open(output) as document:
        assert document.metadata["title"] == "Internal"
        assert len(document[0].get_links()) == 1
        assert len(list(document[0].annots() or [])) == 1
        assert document.embfile_count() == 1
        # Scripts are still removed.
        assert document.xref_get_key(document.pdf_catalog(), "OpenAction")[0] == "null"


# ---------------------------------------------------------
# API
# ---------------------------------------------------------

def upload(client, path: Path) -> str:
    response = client.post(
        "/uploads", files={"file": ("doc.pdf", path.read_bytes(), "application/pdf")}
    )
    return response.json()["stored_filename"]


def test_protect_then_unlock_through_the_api(client, pdf_storage, pdf):
    name = upload(client, pdf)
    protected = client.post(
        f"/security/{name}/protect",
        json={"user_password": "pw-123", "allow_printing": True},
    )
    assert protected.status_code == 200

    # Outputs are not valid inputs, so move the result into the upload folder.
    locked_name = protected.json()["output_filename"]
    (pdf_storage[0] / locked_name).write_bytes(
        (pdf_storage[1] / locked_name).read_bytes()
    )

    wrong = client.post(f"/security/{locked_name}/unlock", json={"password": "bad"})
    assert wrong.status_code == 422 and "Incorrect" in wrong.json()["detail"]

    ok = client.post(f"/security/{locked_name}/unlock", json={"password": "pw-123"})
    assert ok.status_code == 200 and ok.json()["was_encrypted"] is True


def test_redact_endpoint_validates_its_body(client, pdf_storage, pdf):
    name = upload(client, pdf)
    url = f"/security/{name}/redact"
    backwards = {"page": 1, "x0": 5, "y0": 5, "x1": 1, "y1": 9}

    assert client.post(url, json={}).status_code == 422
    assert client.post(url, json={"terms": ["  "]}).status_code == 422
    assert client.post(url, json={"terms": ["x" * 101]}).status_code == 422
    assert client.post(url, json={"regions": [backwards]}).status_code == 422

    ok = client.post(url, json={"terms": ["SECRET"]})
    assert ok.status_code == 200 and ok.json()["search_matches"] == 1


def test_sanitize_endpoint_works_with_and_without_a_body(client, pdf_storage, pdf):
    name = upload(client, pdf)
    url = f"/security/{name}/sanitize"

    assert client.post(url).status_code == 200

    kept = client.post(url, json={"metadata": False})
    assert kept.status_code == 200
    with pymupdf.open(pdf_storage[1] / kept.json()["output_filename"]) as document:
        assert document.metadata["title"] == "Quarterly Plan"


def test_sanitize_removes_scripts_hidden_in_names_pages_and_links(tmp_path):
    source = tmp_path / "scripts.pdf"
    with pymupdf.open() as document:
        page = document.new_page(width=300, height=400)
        page.insert_link(
            {"kind": pymupdf.LINK_URI, "from": pymupdf.Rect(10, 10, 80, 40), "uri": "https://example.com"}
        )
        link_xref = page.annot_xrefs()[0][0]
        document.xref_set_key(link_xref, "A", "<</S/JavaScript/JS(app.alert\(2\))>>")
        document.xref_set_key(page.xref, "AA", "<</O<</S/JavaScript/JS(app.alert\(3\))>>>>")
        document.xref_set_key(
            document.pdf_catalog(),
            "Names",
            "<</JavaScript<</Names[(init)<</S/JavaScript/JS(app.alert\(4\))>>]>>>>",
        )
        document.save(source)

    output = tmp_path / "out.pdf"
    sanitize_pdf(source, output, links=False)  # keep links, still drop their scripts

    for marker in (b"app.alert", b"JavaScript"):
        assert not raw_streams_contain(output, marker)

    with pymupdf.open(output) as document:
        catalog = document.pdf_catalog()
        assert document.xref_get_key(catalog, "Names/JavaScript")[0] == "null"
        assert document.xref_get_key(document[0].xref, "AA")[0] == "null"
        assert document.xref_get_key(document[0].annot_xrefs()[0][0], "A")[0] == "null"
