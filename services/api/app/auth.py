"""Optional single-user sign-in.

Sign-in is switched on by setting PDF_CRAFT_PASSWORD_HASH. Without it the API
is open, which is right for a personal machine but not for a network.

PDF_CRAFT_PASSWORD_HASH   output of `python -m app.auth`
PDF_CRAFT_SECRET          random string that signs session cookies
PDF_CRAFT_SESSION_HOURS   how long a sign-in lasts (168 = 7 days)
PDF_CRAFT_COOKIE_SECURE   "1" when the site is served over HTTPS

Run `python -m app.auth` to choose a password and print its hash.
"""

import base64
import getpass
import hashlib
import hmac
import os
import secrets
import sys
import time
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field


COOKIE_NAME = "pdfcraft_session"
MIN_PASSWORD_LENGTH = 8

# Password guessing limit: this many wrong attempts per window, per address.
MAX_FAILURES = 5
FAILURE_WINDOW_SECONDS = 5 * 60

_SCRYPT = (2**14, 8, 1)  # CPU/memory cost, block size, parallelism


# ---------------------------------------------------------
# Passwords
# ---------------------------------------------------------

def hash_password(password: str) -> str:
    """Salted scrypt hash, stored as `scrypt:n:r:p:salt:hash` (hex)."""
    salt = secrets.token_bytes(16)
    n, r, p = _SCRYPT
    digest = hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, dklen=32)

    return f"scrypt:{n}:{r}:{p}:{salt.hex()}:{digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, expected = stored.split(":")
        if scheme != "scrypt":
            return False

        digest = hashlib.scrypt(
            password.encode(),
            salt=bytes.fromhex(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=32,
        )
    except (ValueError, TypeError):
        return False

    return hmac.compare_digest(digest.hex(), expected)


# ---------------------------------------------------------
# Sessions: "<expiry>.<random>.<signature>", signed with the secret
# ---------------------------------------------------------

def _secret() -> bytes:
    return os.environ.get("PDF_CRAFT_SECRET", "").encode()


def _sign(payload: str) -> str:
    return hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()


def _session_seconds() -> int:
    try:
        hours = float(os.getenv("PDF_CRAFT_SESSION_HOURS", "168"))
    except ValueError:
        hours = 168

    return int(max(hours, 0.1) * 3600)


def make_token() -> str:
    payload = f"{int(time.time()) + _session_seconds()}.{secrets.token_hex(8)}"

    return f"{payload}.{_sign(payload)}"


def valid_token(token: str | None) -> bool:
    try:
        expiry, nonce, signature = (token or "").split(".")
        expires_at = int(expiry)
    except ValueError:
        return False

    return hmac.compare_digest(_sign(f"{expiry}.{nonce}"), signature) and (
        expires_at > time.time()
    )


# ---------------------------------------------------------
# Request handling
# ---------------------------------------------------------

def auth_enabled() -> bool:
    return bool(os.getenv("PDF_CRAFT_PASSWORD_HASH"))


def validate_config() -> None:
    """Refuse to start with a password but nothing to sign sessions with."""
    if auth_enabled() and len(_secret()) < 16:
        raise RuntimeError(
            "PDF_CRAFT_SECRET must be set (16+ characters) when "
            "PDF_CRAFT_PASSWORD_HASH is set."
        )


def _signed_in(request: Request) -> bool:
    return valid_token(request.cookies.get(COOKIE_NAME))


def require_auth(request: Request) -> None:
    """Dependency for every route except health and sign-in."""
    if auth_enabled() and not _signed_in(request):
        raise HTTPException(401, "Sign in required.")


_failures: dict[str, deque[float]] = defaultdict(deque)


def _check_not_locked_out(client: str) -> None:
    now = time.time()
    attempts = _failures[client]

    while attempts and attempts[0] < now - FAILURE_WINDOW_SECONDS:
        attempts.popleft()

    if len(attempts) >= MAX_FAILURES:
        wait = int(attempts[0] + FAILURE_WINDOW_SECONDS - now) + 1
        raise HTTPException(
            429,
            "Too many failed attempts. Try again later.",
            headers={"Retry-After": str(wait)},
        )


router = APIRouter(prefix="/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    password: str = Field(max_length=256)


@router.get("/status")
def status(request: Request) -> dict[str, bool]:
    enabled = auth_enabled()

    return {
        "auth_required": enabled,
        "authenticated": not enabled or _signed_in(request),
    }


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response) -> dict[str, bool]:
    if not auth_enabled():
        return {"authenticated": True}

    client = request.client.host if request.client else "unknown"
    _check_not_locked_out(client)

    if not verify_password(body.password, os.environ["PDF_CRAFT_PASSWORD_HASH"]):
        _failures[client].append(time.time())
        raise HTTPException(401, "Incorrect password.")

    _failures.pop(client, None)
    response.set_cookie(
        COOKIE_NAME,
        make_token(),
        max_age=_session_seconds(),
        httponly=True,
        samesite="lax",
        secure=os.getenv("PDF_CRAFT_COOKIE_SECURE") == "1",
        path="/",
    )

    return {"authenticated": True}


@router.post("/logout")
def logout(response: Response) -> dict[str, bool]:
    response.delete_cookie(COOKIE_NAME, path="/")

    return {"authenticated": False}


# ---------------------------------------------------------
# Command line: python -m app.auth
# ---------------------------------------------------------

def _prompt() -> str:
    """Password from PDF_CRAFT_NEW_PASSWORD (scripts) or an interactive prompt."""
    supplied = os.getenv("PDF_CRAFT_NEW_PASSWORD")

    if supplied is None:
        supplied = getpass.getpass("New password: ")

        if getpass.getpass("Repeat password: ") != supplied:
            sys.exit("The passwords do not match.")

    if len(supplied) < MIN_PASSWORD_LENGTH:
        sys.exit(f"Use at least {MIN_PASSWORD_LENGTH} characters.")

    return supplied


if __name__ == "__main__":
    print(hash_password(_prompt()))
