"""Password hashing, OTP hashing and JWT issuing.

Uses only the standard library for hashing (PBKDF2-HMAC-SHA256) so the service
installs cleanly on hosting without a compiler, and PyJWT for tokens.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

PBKDF2_ITERATIONS = 240_000
SALT_BYTES = 16


def hash_password(password: str, *, iterations: int = PBKDF2_ITERATIONS) -> str:
    """Return `pbkdf2_sha256$iterations$salt$hash` (Django-style, portable)."""
    salt = os.urandom(SALT_BYTES)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return "$".join(
        [
            "pbkdf2_sha256",
            str(iterations),
            base64.b64encode(salt).decode("ascii"),
            base64.b64encode(derived).decode("ascii"),
        ]
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations_raw, salt_b64, hash_b64 = encoded.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_raw)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
    except (ValueError, TypeError):
        return False

    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(candidate, expected)


def generate_otp(length: int = 6) -> str:
    """Cryptographically random numeric OTP with a non-zero first digit."""
    first = secrets.choice("123456789")
    rest = "".join(secrets.choice("0123456789") for _ in range(length - 1))
    return first + rest


def hash_otp(otp: str, request_id: str) -> str:
    """OTPs are stored hashed so a database dump cannot be replayed."""
    return hashlib.sha256(f"{request_id}:{otp}".encode("utf-8")).hexdigest()


def verify_otp(otp: str, request_id: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_otp(otp, request_id), stored_hash)


def create_token(
    *,
    secret: str,
    subject: str,
    role: str,
    ttl_hours: int,
    extra: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=ttl_hours)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, secret, algorithm="HS256")


class TokenError(Exception):
    """Raised when a bearer token is missing, malformed or expired."""


def decode_token(token: str, secret: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("Token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("Token is not valid") from exc
