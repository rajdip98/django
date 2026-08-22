"""Authentication: mobile OTP for field roles, password for administrators."""

from __future__ import annotations

import time
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status

from ..config import Settings
from ..deps import CurrentUser, record_audit, settings_dep, get_store
from ..models import (
    AdminLoginIn,
    AuthOut,
    OtpChallengeOut,
    OtpRequestIn,
    OtpVerifyIn,
    Role,
    UserOut,
    now_iso,
)
from ..security import create_token, generate_otp, hash_otp, hash_password, verify_otp, verify_password
from ..sms import send_otp
from ..store import Store

router = APIRouter(prefix="/api/auth", tags=["auth"])

ADMIN_SUBJECT = "admin"


# Challenges are kept for the whole rate-limit window, not just until they
# expire: the limiter counts them, so sweeping on expiry (5 minutes) would
# quietly reduce "8 per hour" to "8 per 5 minutes". Verification checks
# `expiresEpoch` separately, so a kept-but-expired challenge is still refused.
OTP_RETENTION_SECONDS = 3600


async def _sweep_old_otps(store: Store) -> None:
    """Drop challenges older than the rate-limit window."""
    try:
        await store.delete_where(
            "otps", {"createdEpoch": {"$lt": time.time() - OTP_RETENTION_SECONDS}}
        )
    except Exception as error:  # pragma: no cover - defensive
        print(f"census: OTP sweep failed ({error})")


def _public_user(record: dict[str, Any]) -> UserOut:
    return UserOut.model_validate(record)


@router.post("/otp/request", response_model=OtpChallengeOut)
async def request_otp(
    payload: OtpRequestIn,
    store: Annotated[Store, Depends(get_store)],
    settings: Annotated[Settings, Depends(settings_dep)],
) -> OtpChallengeOut:
    if payload.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators sign in with a password, not an OTP",
        )

    await _sweep_old_otps(store)

    # Rate limit per mobile so the SMS bill (and the recipient) are protected.
    window_start = time.time() - OTP_RETENTION_SECONDS
    recent = await store.find(
        "otps", {"mobile": payload.mobile, "createdEpoch": {"$gte": window_start}}
    )
    if len(recent) >= settings.otp_rate_limit_per_hour:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many codes requested. Please try again later.",
        )

    existing = await store.find_one("users", {"mobile": payload.mobile})
    if existing is None and not settings.allow_self_registration:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This number is not registered. Contact your census administrator.",
        )
    if existing is not None and not existing.get("active", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    request_id = str(uuid.uuid4())
    otp = generate_otp()
    now = time.time()

    await store.put(
        "otps",
        {
            "id": request_id,
            "mobile": payload.mobile,
            "role": payload.role,
            "otpHash": hash_otp(otp, request_id),
            "attempts": 0,
            "createdEpoch": now,
            "expiresEpoch": now + settings.otp_ttl_seconds,
            "createdAt": now_iso(),
        },
    )

    delivery = await send_otp(settings, payload.mobile, otp)

    return OtpChallengeOut(
        requestId=request_id,
        expiresInSeconds=settings.otp_ttl_seconds,
        # Only returned when SMS is not configured — otherwise this would be a
        # complete bypass of the second factor.
        devOtp=None if delivery.delivered else otp,
    )


@router.post("/otp/verify", response_model=AuthOut)
async def verify_otp_endpoint(
    payload: OtpVerifyIn,
    store: Annotated[Store, Depends(get_store)],
    settings: Annotated[Settings, Depends(settings_dep)],
) -> AuthOut:
    challenge = await store.get("otps", payload.requestId)
    if challenge is None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="That code has expired. Please request a new one.",
        )

    if challenge.get("expiresEpoch", 0) < time.time():
        await store.delete("otps", payload.requestId)
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="That code has expired. Please request a new one.",
        )

    mobile = "".join(character for character in payload.mobile if character.isdigit())[-10:]
    if challenge.get("mobile") != mobile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mobile number does not match")

    attempts = int(challenge.get("attempts", 0))
    if attempts >= settings.otp_max_attempts:
        await store.delete("otps", payload.requestId)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many incorrect attempts. Please request a new code.",
        )

    if not verify_otp(payload.otp, payload.requestId, challenge.get("otpHash", "")):
        challenge["attempts"] = attempts + 1
        await store.put("otps", challenge)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="The code you entered is incorrect"
        )

    # Single use.
    await store.delete("otps", payload.requestId)

    record = await store.find_one("users", {"mobile": mobile})

    if record is None:
        if not settings.allow_self_registration:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This number is not registered. Contact your census administrator.",
            )
        requested: Role = challenge.get("role", payload.role)
        if requested == "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not permitted")
        record = {
            "id": str(uuid.uuid4()),
            "name": (payload.name or "").strip() or f"User {mobile[-4:]}",
            "mobile": mobile,
            "role": requested,
            "zoneIds": [],
            "active": True,
            "createdAt": now_iso(),
        }
        await record_audit(
            store,
            actor_id=record["id"],
            actor_name=record["name"],
            action="user.self_register",
            target=record["id"],
            detail=f"role={requested}",
        )
    else:
        # The stored role always wins: otherwise anyone could request the
        # "supervisor" role at login and be granted it.
        if payload.name and payload.name.strip() and not record.get("name"):
            record["name"] = payload.name.strip()

    record["lastLoginAt"] = now_iso()
    saved = await store.put("users", record)

    token = create_token(
        secret=settings.secret_key,
        subject=saved["id"],
        role=saved["role"],
        ttl_hours=settings.token_ttl_hours,
    )

    await record_audit(
        store,
        actor_id=saved["id"],
        actor_name=saved.get("name", ""),
        action="auth.otp_login",
        target=saved["id"],
    )

    return AuthOut(token=token, user=_public_user(saved))


@router.post("/admin/login", response_model=AuthOut)
async def admin_login(
    payload: AdminLoginIn,
    store: Annotated[Store, Depends(get_store)],
    settings: Annotated[Settings, Depends(settings_dep)],
) -> AuthOut:
    expected_hash = settings.admin_password_hash or hash_password(settings.admin_password)

    if not verify_password(payload.password, expected_hash):
        await record_audit(
            store,
            actor_id="anonymous",
            actor_name="",
            action="auth.admin_login_failed",
            target="admin",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect administrator password"
        )

    token = create_token(
        secret=settings.secret_key,
        subject=ADMIN_SUBJECT,
        role="admin",
        ttl_hours=settings.token_ttl_hours,
    )

    await record_audit(
        store,
        actor_id=ADMIN_SUBJECT,
        actor_name="Administrator",
        action="auth.admin_login",
        target="admin",
    )

    return AuthOut(
        token=token,
        user=UserOut(
            id=ADMIN_SUBJECT,
            name="Administrator",
            mobile="",
            role="admin",
            zoneIds=[],
            active=True,
            createdAt=now_iso(),
            lastLoginAt=now_iso(),
        ),
    )


@router.get("/me", response_model=UserOut)
async def me(
    principal: CurrentUser,
    store: Annotated[Store, Depends(get_store)],
) -> UserOut:
    if principal.id == ADMIN_SUBJECT:
        return UserOut(
            id=ADMIN_SUBJECT,
            name="Administrator",
            mobile="",
            role="admin",
            zoneIds=[],
            active=True,
            createdAt=now_iso(),
        )

    record = await store.get("users", principal.id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _public_user(record)
