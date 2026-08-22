"""Shared FastAPI dependencies: store access and authentication."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Query, Request, status

from .config import Settings, get_settings
from .models import Role, now_iso
from .security import TokenError, decode_token
from .store import Store


def get_store(request: Request) -> Store:
    store = getattr(request.app.state, "store", None)
    if store is None:  # pragma: no cover - only if startup failed
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage is not ready",
        )
    return store


def settings_dep() -> Settings:
    return get_settings()


class Principal:
    """The authenticated caller."""

    def __init__(self, user_id: str, role: Role, name: str, zone_ids: list[str]) -> None:
        self.id = user_id
        self.role: Role = role
        self.name = name
        self.zone_ids = zone_ids

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_supervisor(self) -> bool:
        return self.role in ("supervisor", "admin")


def _extract_token(authorization: str | None, token_query: str | None) -> str:
    # The query fallback exists for file downloads, where a browser-initiated
    # navigation cannot carry an Authorization header.
    if authorization:
        scheme, _, value = authorization.partition(" ")
        if scheme.lower() == "bearer" and value.strip():
            return value.strip()
    if token_query:
        return token_query.strip()
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sign in to continue",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def current_principal(
    store: Annotated[Store, Depends(get_store)],
    settings: Annotated[Settings, Depends(settings_dep)],
    authorization: Annotated[str | None, Header()] = None,
    token: Annotated[str | None, Query()] = None,
) -> Principal:
    raw = _extract_token(authorization, token)

    try:
        payload = decode_token(raw, settings.secret_key)
    except TokenError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(error),
            headers={"WWW-Authenticate": "Bearer"},
        ) from error

    subject = payload.get("sub")
    role = payload.get("role")
    if not isinstance(subject, str) or not isinstance(role, str):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed token")

    # The built-in administrator is not a stored user.
    if role == "admin" and subject == "admin":
        return Principal("admin", "admin", "Administrator", [])

    record = await store.get("users", subject)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account no longer exists",
        )
    if not record.get("active", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    return Principal(
        user_id=subject,
        role=record.get("role", role),  # type: ignore[arg-type]
        name=record.get("name", ""),
        zone_ids=list(record.get("zoneIds", [])),
    )


CurrentUser = Annotated[Principal, Depends(current_principal)]


def require_roles(*roles: Role):
    async def guard(principal: CurrentUser) -> Principal:
        if principal.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to do that",
            )
        return principal

    return guard


RequireAdmin = Annotated[Principal, Depends(require_roles("admin"))]
RequireSupervisor = Annotated[Principal, Depends(require_roles("supervisor", "admin"))]


async def record_audit(
    store: Store,
    *,
    actor_id: str,
    actor_name: str,
    action: str,
    target: str,
    detail: str = "",
) -> None:
    """Append-only audit trail. Never raises — auditing must not break a request."""
    import uuid

    entry: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "at": now_iso(),
        "actorId": actor_id,
        "actorName": actor_name,
        "action": action,
        "target": target,
        "detail": detail,
    }
    try:
        await store.put("audit", entry)
    except Exception as error:  # pragma: no cover - defensive
        print(f"census: could not write audit entry ({error})")
