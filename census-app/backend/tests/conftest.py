"""Test fixtures: an isolated app instance per test, backed by a temp data dir."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterator

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config  # noqa: E402


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-not-for-production")
    monkeypatch.setenv("ADMIN_PASSWORD", "rajdip100@")
    monkeypatch.delenv("MONGODB_URI", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD_HASH", raising=False)
    monkeypatch.delenv("TWILIO_ACCOUNT_SID", raising=False)
    monkeypatch.delenv("AI_BASE_URL", raising=False)
    monkeypatch.delenv("AI_API_KEY", raising=False)
    monkeypatch.setenv("OTP_RATE_LIMIT_PER_HOUR", "50")

    config.reset_settings_cache()

    from app.main import create_app

    with TestClient(create_app()) as test_client:
        yield test_client

    config.reset_settings_cache()


def sign_in(client: TestClient, mobile: str, role: str, name: str) -> dict:
    """Complete the OTP round trip and return {'token', 'user'}."""
    challenge = client.post(
        "/api/auth/otp/request", json={"mobile": mobile, "role": role}
    )
    assert challenge.status_code == 200, challenge.text
    body = challenge.json()
    assert body["devOtp"], "SMS is not configured, so the code should be returned"

    verified = client.post(
        "/api/auth/otp/verify",
        json={
            "requestId": body["requestId"],
            "mobile": mobile,
            "otp": body["devOtp"],
            "role": role,
            "name": name,
        },
    )
    assert verified.status_code == 200, verified.text
    return verified.json()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def household_payload(household_id: str, **overrides) -> dict:
    """A minimal but valid household record, matching the frontend's shape."""
    payload = {
        "id": household_id,
        "householdNumber": f"HH-{household_id[:6].upper()}",
        "status": "submitted",
        "zoneId": "",
        "collectedBy": "enumerator",
        "enumeratorId": "",
        "enumeratorName": "",
        "location": {"lat": 22.5726, "lng": 88.3639, "accuracy": 12.0},
        "address": {
            "houseNumber": "12A",
            "village": "Salt Lake",
            "district": "North 24 Parganas",
            "state": "West Bengal",
            "pincode": "700091",
        },
        "housing": {
            "buildingType": "pucca",
            "ownership": "owned",
            "rooms": 3,
            "waterSource": "tap_treated",
            "toilet": "flush_septic",
            "lighting": "electricity",
            "cookingFuel": "lpg_png",
            "assets": ["television", "smartphone"],
        },
        "members": [
            {
                "id": f"{household_id}-m1",
                "name": "Asha Debnath",
                "relationToHead": "head",
                "gender": "female",
                "age": 42,
                "maritalStatus": "married",
                "religion": "hindu",
                "casteCategory": "general",
                "motherTongue": "bengali",
                "literate": True,
                "education": "graduate",
                "economicActivity": "main_worker",
                "occupation": "Teacher",
                "disability": "none",
            }
        ],
        "photos": [],
        "notes": "",
        "language": "bn",
        "flags": [],
        "reviews": [],
        "createdAt": "2026-08-01T09:00:00Z",
        "updatedAt": "2026-08-01T09:30:00Z",
        "submittedAt": "2026-08-01T09:30:00Z",
        "rev": 0,
    }
    payload.update(overrides)
    return payload
