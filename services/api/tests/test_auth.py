"""Optional sign-in, upload limits and storage settings used by deployments."""

import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from app import auth

SECRET = "x" * 32


@pytest.fixture
def protected(monkeypatch):
    """Switch sign-in on with the password 'correct horse'."""
    monkeypatch.setenv("PDF_CRAFT_PASSWORD_HASH", auth.hash_password("correct horse"))
    monkeypatch.setenv("PDF_CRAFT_SECRET", SECRET)
    auth._failures.clear()
    yield
    auth._failures.clear()


def sign_in(client, password="correct horse"):
    return client.post("/auth/login", json={"password": password})


# ---------------------------------------------------------
# Passwords and tokens
# ---------------------------------------------------------

def test_password_hashes_are_salted_and_verifiable():
    first, second = auth.hash_password("secret-pass"), auth.hash_password("secret-pass")

    assert first != second  # random salt
    assert auth.verify_password("secret-pass", first)
    assert not auth.verify_password("other-pass", first)
    assert "secret-pass" not in first


@pytest.mark.parametrize("stored", ["", "plain", "scrypt:1:2", "md5:1:1:1:aa:bb", "scrypt:x:8:1:zz:zz"])
def test_malformed_stored_hashes_never_verify(stored):
    assert not auth.verify_password("anything", stored)


def test_tokens_are_signed_and_expire(monkeypatch):
    monkeypatch.setenv("PDF_CRAFT_SECRET", SECRET)
    token = auth.make_token()

    assert auth.valid_token(token)
    assert not auth.valid_token(None)
    assert not auth.valid_token(token[:-1] + ("0" if token[-1] != "0" else "1"))
    assert not auth.valid_token("1.2.3")

    # Same payload signed with a different secret is rejected.
    monkeypatch.setenv("PDF_CRAFT_SECRET", "y" * 32)
    assert not auth.valid_token(token)

    monkeypatch.setenv("PDF_CRAFT_SECRET", SECRET)
    expired = f"{int(time.time()) - 5}.abc"
    assert not auth.valid_token(f"{expired}.{auth._sign(expired)}")


def test_startup_requires_a_secret_when_a_password_is_set(monkeypatch):
    monkeypatch.setenv("PDF_CRAFT_PASSWORD_HASH", auth.hash_password("correct horse"))
    monkeypatch.setenv("PDF_CRAFT_SECRET", "short")

    with pytest.raises(RuntimeError, match="PDF_CRAFT_SECRET"):
        auth.validate_config()


# ---------------------------------------------------------
# API behaviour
# ---------------------------------------------------------

def test_everything_is_open_when_no_password_is_configured(client):
    assert client.get("/auth/status").json() == {"auth_required": False, "authenticated": True}
    assert client.get("/jobs").status_code == 200


def test_protected_routes_need_a_session(client, protected):
    assert client.get("/jobs").status_code == 401
    assert client.get("/jobs/retention").status_code == 401
    assert client.delete("/jobs").status_code == 401
    assert client.get("/outputs/anything.pdf").status_code == 401
    assert client.post("/uploads", files={"file": ("a.pdf", b"%PDF-", "application/pdf")}).status_code == 401
    assert client.get("/uploads/x.pdf/pages/1/preview").status_code == 401
    assert client.post("/operations/merge", json={"filenames": ["a.pdf", "b.pdf"]}).status_code == 401
    assert client.post("/conversions/docx-to-pdf", files={"file": ("a.docx", b"x")}).status_code == 401
    assert client.post("/security/x.pdf/sanitize").status_code == 401
    assert client.get("/files").status_code == 401
    assert client.post("/files", files={"file": ("a.pdf", b"%PDF-")}).status_code == 401
    assert client.get("/files/x.pdf/download").status_code == 401
    assert client.delete("/files/x.pdf").status_code == 401
    assert client.get("/registry/operations").status_code == 401
    assert client.get("/flows/runs").status_code == 401
    assert client.post("/flows/validate", json={"nodes": [], "edges": []}).status_code == 401


def test_health_and_status_stay_reachable(client, protected):
    assert client.get("/health").status_code == 200
    assert client.get("/auth/status").json() == {"auth_required": True, "authenticated": False}


def test_signing_in_unlocks_the_api_and_signing_out_locks_it(client, protected):
    response = sign_in(client)

    assert response.status_code == 200
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "secure" not in cookie

    assert client.get("/jobs").status_code == 200
    assert client.get("/auth/status").json()["authenticated"] is True

    client.post("/auth/logout")
    assert client.get("/jobs").status_code == 401


def test_secure_cookie_flag_follows_the_setting(client, protected, monkeypatch):
    monkeypatch.setenv("PDF_CRAFT_COOKIE_SECURE", "1")

    assert "secure" in sign_in(client).headers["set-cookie"].lower()


def test_wrong_password_is_rejected(client, protected):
    response = sign_in(client, "nope")

    assert response.status_code == 401
    assert "set-cookie" not in response.headers
    assert client.get("/jobs").status_code == 401


def test_a_forged_cookie_is_rejected(client, protected):
    client.cookies.set(auth.COOKIE_NAME, "9999999999.abcd.deadbeef")

    assert client.get("/jobs").status_code == 401


def test_repeated_wrong_passwords_are_throttled(client, protected):
    for _ in range(auth.MAX_FAILURES):
        assert sign_in(client, "wrong").status_code == 401

    locked = sign_in(client, "correct horse")  # even the right one waits
    assert locked.status_code == 429
    assert int(locked.headers["retry-after"]) > 0

    auth._failures.clear()
    assert sign_in(client).status_code == 200


def test_a_successful_sign_in_resets_the_failure_count(client, protected):
    for _ in range(auth.MAX_FAILURES - 1):
        sign_in(client, "wrong")

    assert sign_in(client).status_code == 200

    for _ in range(auth.MAX_FAILURES - 1):
        assert sign_in(client, "wrong").status_code == 401


# ---------------------------------------------------------
# Command line and settings
# ---------------------------------------------------------

def run_cli(password):
    return subprocess.run(
        [sys.executable, "-m", "app.auth"],
        env={**os.environ, "PDF_CRAFT_NEW_PASSWORD": password},
        capture_output=True,
        text=True,
        cwd=Path(__file__).resolve().parents[1],
    )


def test_command_line_prints_a_working_hash_and_enforces_length():
    ok = run_cli("long enough pw")

    assert ok.returncode == 0
    assert auth.verify_password("long enough pw", ok.stdout.strip())

    short = run_cli("short")
    assert short.returncode != 0 and "at least" in short.stderr


def test_upload_limits_can_be_changed_with_environment_variables(monkeypatch):
    import importlib

    from app import config

    monkeypatch.setenv("PDF_CRAFT_MAX_UPLOAD_MB", "40")
    monkeypatch.setenv("PDF_CRAFT_MAX_IMAGE_MB", "not-a-number")
    reloaded = importlib.reload(config)

    try:
        assert reloaded.MAX_UPLOAD_BYTES == 40 * 1024 * 1024
        assert reloaded.MAX_IMAGE_BYTES == 10 * 1024 * 1024  # falls back
    finally:
        monkeypatch.undo()
        importlib.reload(config)


def test_oversized_upload_is_rejected_with_the_configured_limit(client, monkeypatch):
    import app.api.routers.uploads as uploads

    monkeypatch.setattr(uploads, "MAX_UPLOAD_BYTES", 1024)
    response = client.post(
        "/uploads",
        files={"file": ("big.pdf", b"%PDF-" + b"0" * 2048, "application/pdf")},
    )

    assert response.status_code == 413
    assert "MB limit" in response.json()["detail"]
