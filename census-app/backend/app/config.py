"""Runtime configuration, read from the environment.

Every setting has a working default so `uvicorn app.main:app` starts with no
configuration at all — important because this app is meant to be downloaded and
run on ordinary hosting. Production deployments should at minimum set
SECRET_KEY and ADMIN_PASSWORD.
"""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path

APP_VERSION = "1.0.0"


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _split(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    secret_key: str
    mongodb_uri: str | None
    mongodb_db: str
    admin_password: str
    admin_password_hash: str | None
    allow_self_registration: bool
    otp_ttl_seconds: int
    otp_max_attempts: int
    otp_rate_limit_per_hour: int
    token_ttl_hours: int
    cors_origins: list[str]
    static_dir: Path | None
    max_request_bytes: int

    # Twilio (SMS delivery). Without all three the API returns the OTP in the
    # response body instead, which keeps the flow usable in development.
    twilio_account_sid: str | None
    twilio_auth_token: str | None
    twilio_from_number: str | None

    # Optional AI provider — any OpenAI-compatible chat-completions endpoint.
    ai_base_url: str | None
    ai_api_key: str | None
    ai_model: str
    ai_timeout_seconds: int

    @property
    def sms_enabled(self) -> bool:
        return bool(self.twilio_account_sid and self.twilio_auth_token and self.twilio_from_number)

    @property
    def ai_enabled(self) -> bool:
        return bool(self.ai_base_url and self.ai_api_key)


def _resolve_secret_key(data_dir: Path) -> str:
    """Use SECRET_KEY when provided, else persist a generated one.

    Persisting matters: a fresh key on every restart would silently log every
    enumerator out and lose in-flight OTP challenges.
    """
    configured = os.getenv("SECRET_KEY")
    if configured and configured.strip():
        return configured.strip()

    key_file = data_dir / ".secret_key"
    try:
        if key_file.exists():
            stored = key_file.read_text(encoding="utf-8").strip()
            if stored:
                return stored
        generated = secrets.token_urlsafe(48)
        data_dir.mkdir(parents=True, exist_ok=True)
        key_file.write_text(generated, encoding="utf-8")
        try:
            key_file.chmod(0o600)
        except OSError:
            pass  # Windows and some shared hosts do not support chmod.
        return generated
    except OSError:
        # Read-only filesystem: fall back to an in-process key. Tokens will not
        # survive a restart, which is acceptable for an ephemeral deployment.
        return secrets.token_urlsafe(48)


def _resolve_static_dir() -> Path | None:
    """Locate the built frontend so one process can serve API and app."""
    configured = os.getenv("STATIC_DIR")
    if configured:
        path = Path(configured).expanduser().resolve()
        return path if path.is_dir() else None

    here = Path(__file__).resolve().parent.parent  # backend/
    for candidate in (here / "static", here.parent / "frontend" / "dist"):
        if candidate.is_dir():
            return candidate.resolve()
    return None


def load_settings() -> Settings:
    data_dir = Path(os.getenv("DATA_DIR", "./data")).expanduser().resolve()

    return Settings(
        data_dir=data_dir,
        secret_key=_resolve_secret_key(data_dir),
        mongodb_uri=os.getenv("MONGODB_URI") or None,
        mongodb_db=os.getenv("MONGODB_DB", "india_census_2026"),
        admin_password=os.getenv("ADMIN_PASSWORD", "rajdip100@"),
        admin_password_hash=os.getenv("ADMIN_PASSWORD_HASH") or None,
        allow_self_registration=_env_bool("ALLOW_SELF_REGISTRATION", True),
        otp_ttl_seconds=_env_int("OTP_TTL_SECONDS", 300),
        otp_max_attempts=_env_int("OTP_MAX_ATTEMPTS", 5),
        otp_rate_limit_per_hour=_env_int("OTP_RATE_LIMIT_PER_HOUR", 8),
        token_ttl_hours=_env_int("TOKEN_TTL_HOURS", 24 * 14),
        cors_origins=_split(os.getenv("CORS_ORIGINS")) or ["*"],
        static_dir=_resolve_static_dir(),
        # A sync push may legitimately carry photographs, but not unbounded
        # ones: 200 households × 6 photos would otherwise be gigabytes.
        max_request_bytes=_env_int("MAX_REQUEST_BYTES", 32 * 1024 * 1024),
        twilio_account_sid=os.getenv("TWILIO_ACCOUNT_SID") or None,
        twilio_auth_token=os.getenv("TWILIO_AUTH_TOKEN") or None,
        twilio_from_number=os.getenv("TWILIO_FROM_NUMBER") or None,
        ai_base_url=os.getenv("AI_BASE_URL") or None,
        ai_api_key=os.getenv("AI_API_KEY") or None,
        ai_model=os.getenv("AI_MODEL", "gemini-2.0-flash"),
        ai_timeout_seconds=_env_int("AI_TIMEOUT_SECONDS", 25),
    )


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = load_settings()
    return _settings


def reset_settings_cache() -> None:
    """Used by the test suite to reload configuration between cases."""
    global _settings
    _settings = None
