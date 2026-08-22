"""End-to-end API tests against the embedded (no-Mongo) store."""

from __future__ import annotations

import uuid

from conftest import auth, household_payload, sign_in
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Health & metadata
# ---------------------------------------------------------------------------


def test_health_reports_embedded_store(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "embedded"
    assert body["smsEnabled"] is False
    assert body["aiEnabled"] is False


def test_serves_the_built_frontend(client: TestClient) -> None:
    response = client.get("/")
    # The frontend is built in this repo, so the SPA should be served.
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "India Census" in response.text


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


def test_otp_round_trip_creates_a_user(client: TestClient) -> None:
    session = sign_in(client, "9876543210", "enumerator", "Ravi Kumar")
    assert session["user"]["role"] == "enumerator"
    assert session["user"]["mobile"] == "9876543210"

    me = client.get("/api/auth/me", headers=auth(session["token"]))
    assert me.status_code == 200
    assert me.json()["name"] == "Ravi Kumar"


def test_otp_rejects_a_wrong_code(client: TestClient) -> None:
    challenge = client.post(
        "/api/auth/otp/request", json={"mobile": "9876543211", "role": "citizen"}
    ).json()

    wrong = "000000" if challenge["devOtp"] != "000000" else "111111"
    response = client.post(
        "/api/auth/otp/verify",
        json={
            "requestId": challenge["requestId"],
            "mobile": "9876543211",
            "otp": wrong,
            "role": "citizen",
        },
    )
    assert response.status_code == 401


def test_otp_is_single_use(client: TestClient) -> None:
    challenge = client.post(
        "/api/auth/otp/request", json={"mobile": "9876543212", "role": "citizen"}
    ).json()
    body = {
        "requestId": challenge["requestId"],
        "mobile": "9876543212",
        "otp": challenge["devOtp"],
        "role": "citizen",
    }
    assert client.post("/api/auth/otp/verify", json=body).status_code == 200
    # Replaying the same challenge must fail.
    assert client.post("/api/auth/otp/verify", json=body).status_code == 410


def test_otp_rejects_invalid_mobile(client: TestClient) -> None:
    response = client.post("/api/auth/otp/request", json={"mobile": "12345", "role": "citizen"})
    assert response.status_code == 422


def test_admin_role_cannot_use_otp(client: TestClient) -> None:
    response = client.post(
        "/api/auth/otp/request", json={"mobile": "9876543213", "role": "admin"}
    )
    assert response.status_code == 400


def test_stored_role_wins_over_requested_role(client: TestClient) -> None:
    """A citizen must not be able to escalate by asking for 'supervisor'."""
    first = sign_in(client, "9876500001", "citizen", "Meena")
    assert first["user"]["role"] == "citizen"

    second = sign_in(client, "9876500001", "supervisor", "Meena")
    assert second["user"]["role"] == "citizen"


def test_admin_password_login(client: TestClient) -> None:
    good = client.post("/api/auth/admin/login", json={"password": "rajdip100@"})
    assert good.status_code == 200
    assert good.json()["user"]["role"] == "admin"

    bad = client.post("/api/auth/admin/login", json={"password": "wrong"})
    assert bad.status_code == 401


def test_protected_routes_need_a_token(client: TestClient) -> None:
    assert client.get("/api/households").status_code == 401
    assert client.get("/api/audit").status_code == 401


def test_rate_limit_blocks_otp_flooding(client: TestClient, monkeypatch) -> None:
    from app import config

    monkeypatch.setenv("OTP_RATE_LIMIT_PER_HOUR", "3")
    config.reset_settings_cache()

    for _ in range(3):
        assert (
            client.post(
                "/api/auth/otp/request", json={"mobile": "9876500002", "role": "citizen"}
            ).status_code
            == 200
        )

    blocked = client.post(
        "/api/auth/otp/request", json={"mobile": "9876500002", "role": "citizen"}
    )
    assert blocked.status_code == 429


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------


def test_push_then_pull_round_trip(client: TestClient) -> None:
    session = sign_in(client, "9876543220", "enumerator", "Ravi Kumar")
    headers = auth(session["token"])
    household_id = str(uuid.uuid4())

    push = client.post(
        "/api/sync/push",
        json={"households": [household_payload(household_id)]},
        headers=headers,
    )
    assert push.status_code == 200, push.text
    results = push.json()["results"]
    assert results[0]["status"] == "accepted"
    assert results[0]["rev"] == 1

    pull = client.get("/api/sync/pull", headers=headers)
    assert pull.status_code == 200
    households = pull.json()["households"]
    assert len(households) == 1
    # The server stamps ownership so a record can never be orphaned.
    assert households[0]["enumeratorId"] == session["user"]["id"]
    assert households[0]["members"][0]["name"] == "Asha Debnath"


def test_push_increments_revision(client: TestClient) -> None:
    session = sign_in(client, "9876543221", "enumerator", "Ravi")
    headers = auth(session["token"])
    household_id = str(uuid.uuid4())

    client.post(
        "/api/sync/push", json={"households": [household_payload(household_id)]}, headers=headers
    )

    second = client.post(
        "/api/sync/push",
        json={
            "households": [
                household_payload(household_id, rev=1, updatedAt="2026-08-02T09:30:00Z")
            ]
        },
        headers=headers,
    )
    assert second.json()["results"][0]["rev"] == 2


def test_stale_push_is_reported_as_conflict(client: TestClient) -> None:
    session = sign_in(client, "9876543222", "enumerator", "Ravi")
    headers = auth(session["token"])
    household_id = str(uuid.uuid4())

    client.post(
        "/api/sync/push",
        json={"households": [household_payload(household_id, updatedAt="2026-08-05T10:00:00Z")]},
        headers=headers,
    )

    # An older device copy, still on rev 0, must not overwrite the server.
    stale = client.post(
        "/api/sync/push",
        json={
            "households": [
                household_payload(household_id, rev=0, updatedAt="2026-08-01T09:00:00Z")
            ]
        },
        headers=headers,
    )
    result = stale.json()["results"][0]
    assert result["status"] == "conflict"
    assert result["household"]["updatedAt"] == "2026-08-05T10:00:00Z"


def test_newer_offline_edit_wins_but_keeps_review_trail(client: TestClient) -> None:
    enumerator = sign_in(client, "9876543223", "enumerator", "Ravi")
    supervisor = sign_in(client, "9876543224", "supervisor", "Sunita")
    household_id = str(uuid.uuid4())

    client.post(
        "/api/sync/push",
        json={"households": [household_payload(household_id)]},
        headers=auth(enumerator["token"]),
    )

    flagged = client.post(
        f"/api/households/{household_id}/review",
        json={"action": "flagged", "text": "Please re-check the GPS reading"},
        headers=auth(supervisor["token"]),
    )
    assert flagged.status_code == 200
    assert flagged.json()["status"] == "flagged"

    # The enumerator was offline and pushes a newer edit at the old revision.
    merged = client.post(
        "/api/sync/push",
        json={
            "households": [
                household_payload(household_id, rev=1, updatedAt="2026-09-01T10:00:00Z")
            ]
        },
        headers=auth(enumerator["token"]),
    )
    assert merged.json()["results"][0]["status"] == "accepted"

    record = client.get(
        f"/api/households/{household_id}", headers=auth(supervisor["token"])
    ).json()
    assert record["status"] == "flagged", "a supervisor decision must survive the merge"
    assert len(record["reviews"]) == 1


def test_pull_since_filters_by_timestamp(client: TestClient) -> None:
    session = sign_in(client, "9876543225", "enumerator", "Ravi")
    headers = auth(session["token"])

    client.post(
        "/api/sync/push",
        json={
            "households": [
                household_payload(str(uuid.uuid4()), updatedAt="2026-08-01T09:00:00Z"),
                household_payload(str(uuid.uuid4()), updatedAt="2026-08-10T09:00:00Z"),
            ]
        },
        headers=headers,
    )

    recent = client.get("/api/sync/pull?since=2026-08-05T00:00:00Z", headers=headers)
    assert len(recent.json()["households"]) == 1


def test_oversized_batch_is_rejected(client: TestClient) -> None:
    session = sign_in(client, "9876543226", "enumerator", "Ravi")
    payload = {"households": [household_payload(str(uuid.uuid4())) for _ in range(201)]}
    response = client.post("/api/sync/push", json=payload, headers=auth(session["token"]))
    assert response.status_code == 422


def test_implausible_age_is_rejected(client: TestClient) -> None:
    session = sign_in(client, "9876543227", "enumerator", "Ravi")
    household = household_payload(str(uuid.uuid4()))
    household["members"][0]["age"] = 400
    response = client.post(
        "/api/sync/push", json={"households": [household]}, headers=auth(session["token"])
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------


def test_enumerators_cannot_see_each_others_households(client: TestClient) -> None:
    first = sign_in(client, "9876543230", "enumerator", "Ravi")
    second = sign_in(client, "9876543231", "enumerator", "Priya")

    household_id = str(uuid.uuid4())
    client.post(
        "/api/sync/push",
        json={"households": [household_payload(household_id)]},
        headers=auth(first["token"]),
    )

    assert (
        client.get(f"/api/households/{household_id}", headers=auth(second["token"])).status_code
        == 404
    )
    assert client.get("/api/households", headers=auth(second["token"])).json()["households"] == []


def test_enumerators_cannot_overwrite_another_record(client: TestClient) -> None:
    first = sign_in(client, "9876543232", "enumerator", "Ravi")
    second = sign_in(client, "9876543233", "enumerator", "Priya")

    household_id = str(uuid.uuid4())
    client.post(
        "/api/sync/push",
        json={"households": [household_payload(household_id)]},
        headers=auth(first["token"]),
    )

    hijack = client.post(
        "/api/sync/push",
        json={"households": [household_payload(household_id, rev=1)]},
        headers=auth(second["token"]),
    )
    assert hijack.json()["results"][0]["status"] == "rejected"


def test_enumerators_cannot_review(client: TestClient) -> None:
    session = sign_in(client, "9876543234", "enumerator", "Ravi")
    household_id = str(uuid.uuid4())
    client.post(
        "/api/sync/push",
        json={"households": [household_payload(household_id)]},
        headers=auth(session["token"]),
    )

    response = client.post(
        f"/api/households/{household_id}/review",
        json={"action": "approved", "text": "ok"},
        headers=auth(session["token"]),
    )
    assert response.status_code == 403


def test_supervisors_cannot_reach_the_audit_log(client: TestClient) -> None:
    supervisor = sign_in(client, "9876543235", "supervisor", "Sunita")
    assert client.get("/api/audit", headers=auth(supervisor["token"])).status_code == 403


def test_flagging_requires_a_note(client: TestClient) -> None:
    enumerator = sign_in(client, "9876543236", "enumerator", "Ravi")
    supervisor = sign_in(client, "9876543237", "supervisor", "Sunita")
    household_id = str(uuid.uuid4())
    client.post(
        "/api/sync/push",
        json={"households": [household_payload(household_id)]},
        headers=auth(enumerator["token"]),
    )

    response = client.post(
        f"/api/households/{household_id}/review",
        json={"action": "flagged", "text": "   "},
        headers=auth(supervisor["token"]),
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Admin: zones, users, analytics, export, audit
# ---------------------------------------------------------------------------


def admin_token(client: TestClient) -> str:
    return client.post("/api/auth/admin/login", json={"password": "rajdip100@"}).json()["token"]


def test_zone_lifecycle(client: TestClient) -> None:
    headers = auth(admin_token(client))

    created = client.post(
        "/api/zones",
        json={"code": "wb-01", "name": "Salt Lake Sector V", "district": "North 24 Parganas",
              "state": "West Bengal", "targetHouseholds": 250},
        headers=headers,
    )
    assert created.status_code == 200, created.text
    zone = created.json()
    assert zone["code"] == "WB-01"

    duplicate = client.post(
        "/api/zones", json={"code": "WB-01", "name": "Another"}, headers=headers
    )
    assert duplicate.status_code == 409

    updated = client.patch(
        f"/api/zones/{zone['id']}", json={"targetHouseholds": 300}, headers=headers
    )
    assert updated.json()["targetHouseholds"] == 300

    assert client.delete(f"/api/zones/{zone['id']}", headers=headers).status_code == 200
    assert client.get("/api/zones", headers=headers).json()["zones"] == []


def test_zone_with_households_cannot_be_deleted(client: TestClient) -> None:
    headers = auth(admin_token(client))
    zone = client.post(
        "/api/zones", json={"code": "WB-02", "name": "Ward 12"}, headers=headers
    ).json()

    enumerator = sign_in(client, "9876543240", "enumerator", "Ravi")
    client.post(
        "/api/sync/push",
        json={"households": [household_payload(str(uuid.uuid4()), zoneId=zone["id"])]},
        headers=auth(enumerator["token"]),
    )

    assert client.delete(f"/api/zones/{zone['id']}", headers=headers).status_code == 409


def test_user_management(client: TestClient) -> None:
    headers = auth(admin_token(client))

    created = client.post(
        "/api/users",
        json={"name": "Priya Sharma", "mobile": "+91 98765 43241", "role": "enumerator"},
        headers=headers,
    )
    assert created.status_code == 200, created.text
    user = created.json()
    assert user["mobile"] == "9876543241"

    clash = client.post(
        "/api/users", json={"name": "Someone", "mobile": "9876543241", "role": "enumerator"},
        headers=headers,
    )
    assert clash.status_code == 409

    bad = client.post(
        "/api/users", json={"name": "Bad", "mobile": "12345", "role": "enumerator"},
        headers=headers,
    )
    assert bad.status_code == 400

    patched = client.patch(
        f"/api/users/{user['id']}", json={"active": False}, headers=headers
    )
    assert patched.json()["active"] is False

    assert client.delete(f"/api/users/{user['id']}", headers=headers).status_code == 200


def test_user_with_data_is_deactivated_not_deleted(client: TestClient) -> None:
    headers = auth(admin_token(client))
    enumerator = sign_in(client, "9876543242", "enumerator", "Ravi")
    client.post(
        "/api/sync/push",
        json={"households": [household_payload(str(uuid.uuid4()))]},
        headers=auth(enumerator["token"]),
    )

    client.delete(f"/api/users/{enumerator['user']['id']}", headers=headers)

    users = client.get("/api/users", headers=headers).json()["users"]
    match = next(user for user in users if user["id"] == enumerator["user"]["id"])
    assert match["active"] is False


def test_disabled_account_cannot_use_its_token(client: TestClient) -> None:
    admin_headers = auth(admin_token(client))
    enumerator = sign_in(client, "9876543243", "enumerator", "Ravi")

    client.patch(
        f"/api/users/{enumerator['user']['id']}", json={"active": False}, headers=admin_headers
    )

    assert client.get("/api/households", headers=auth(enumerator["token"])).status_code == 403


def test_analytics_summary(client: TestClient) -> None:
    headers = auth(admin_token(client))
    enumerator = sign_in(client, "9876543244", "enumerator", "Ravi")
    client.post(
        "/api/sync/push",
        json={"households": [household_payload(str(uuid.uuid4())) for _ in range(3)]},
        headers=auth(enumerator["token"]),
    )

    summary = client.get("/api/analytics/summary", headers=headers).json()
    assert summary["households"] == 3
    assert summary["members"] == 3
    assert summary["submitted"] == 3
    assert summary["genderCounts"]["female"] == 3
    assert summary["literacy"]["literate"] == 3
    assert summary["averageHouseholdSize"] == 1.0
    assert len(summary["dailyCounts"]) == 14


def test_csv_and_json_export(client: TestClient) -> None:
    headers = auth(admin_token(client))
    enumerator = sign_in(client, "9876543245", "enumerator", "Ravi")
    client.post(
        "/api/sync/push",
        json={"households": [household_payload(str(uuid.uuid4()))]},
        headers=auth(enumerator["token"]),
    )

    households_csv = client.get("/api/export?format=csv&scope=households", headers=headers)
    assert households_csv.status_code == 200
    assert "text/csv" in households_csv.headers["content-type"]
    assert "household_number" in households_csv.text
    assert "West Bengal" in households_csv.text

    members_csv = client.get("/api/export?format=csv&scope=members", headers=headers)
    assert "Asha Debnath" in members_csv.text

    as_json = client.get("/api/export?format=json&scope=households", headers=headers)
    assert as_json.json()["format"] == "india-census-2026"


def test_export_accepts_a_token_query_parameter(client: TestClient) -> None:
    """Browser downloads cannot set an Authorization header."""
    token = admin_token(client)
    response = client.get(f"/api/export?format=csv&scope=households&token={token}")
    assert response.status_code == 200


def test_audit_log_records_actions(client: TestClient) -> None:
    headers = auth(admin_token(client))
    enumerator = sign_in(client, "9876543246", "enumerator", "Ravi")
    client.post(
        "/api/sync/push",
        json={"households": [household_payload(str(uuid.uuid4()))]},
        headers=auth(enumerator["token"]),
    )

    entries = client.get("/api/audit", headers=headers).json()["entries"]
    actions = {entry["action"] for entry in entries}
    assert "auth.admin_login" in actions
    assert "auth.otp_login" in actions
    assert "sync.push" in actions


# ---------------------------------------------------------------------------
# Citizens
# ---------------------------------------------------------------------------


def test_acknowledgement_lookup_is_public_but_minimal(client: TestClient) -> None:
    citizen = sign_in(client, "9876543250", "citizen", "Asha")
    household_id = str(uuid.uuid4())
    client.post(
        "/api/sync/push",
        json={
            "households": [
                household_payload(
                    household_id, collectedBy="citizen", acknowledgementId="CEN26-ABCD2345"
                )
            ]
        },
        headers=auth(citizen["token"]),
    )

    found = client.get("/api/households/acknowledgement/CEN26-ABCD2345")
    assert found.status_code == 200
    body = found.json()
    assert body["members"] == 1
    # Personal details must never appear in a public lookup.
    assert "address" not in body
    assert "Asha Debnath" not in found.text

    assert client.get("/api/households/acknowledgement/NOPE").status_code == 404


def test_ai_endpoints_report_unavailable_when_unconfigured(client: TestClient) -> None:
    session = sign_in(client, "9876543251", "enumerator", "Ravi")
    response = client.post(
        "/api/ai/validate",
        json={"household": household_payload(str(uuid.uuid4()))},
        headers=auth(session["token"]),
    )
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Regressions
# ---------------------------------------------------------------------------


def test_query_token_is_only_accepted_for_downloads(client: TestClient) -> None:
    """Tokens in query strings leak into access logs, so only /api/export takes one."""
    token = admin_token(client)

    assert client.get(f"/api/export?format=csv&scope=households&token={token}").status_code == 200

    for path in ("/api/households", "/api/audit", "/api/zones", "/api/analytics/summary"):
        response = client.get(f"{path}?token={token}")
        assert response.status_code == 401, f"{path} accepted a query-string token"


def test_rate_limit_counts_expired_challenges(client: TestClient, monkeypatch) -> None:
    """The limiter must span the full hour, not just the OTP lifetime.

    Sweeping challenges the moment they expire would silently turn
    "8 per hour" into "8 per OTP lifetime".
    """
    from app import config

    monkeypatch.setenv("OTP_RATE_LIMIT_PER_HOUR", "2")
    monkeypatch.setenv("OTP_TTL_SECONDS", "0")  # every challenge expires instantly
    config.reset_settings_cache()

    for _ in range(2):
        assert (
            client.post(
                "/api/auth/otp/request", json={"mobile": "9876500009", "role": "citizen"}
            ).status_code
            == 200
        )

    blocked = client.post(
        "/api/auth/otp/request", json={"mobile": "9876500009", "role": "citizen"}
    )
    assert blocked.status_code == 429


def test_push_batch_is_committed_atomically(client: TestClient) -> None:
    session = sign_in(client, "9876500010", "enumerator", "Ravi")
    headers = auth(session["token"])

    batch = [household_payload(str(uuid.uuid4())) for _ in range(25)]
    push = client.post("/api/sync/push", json={"households": batch}, headers=headers)

    assert push.status_code == 200
    assert all(result["status"] == "accepted" for result in push.json()["results"])
    assert len(client.get("/api/households", headers=headers).json()["households"]) == 25


def test_repeated_id_within_one_batch_is_sequenced(client: TestClient) -> None:
    """A duplicate id in the same push must see the earlier entry, not the store."""
    session = sign_in(client, "9876500011", "enumerator", "Ravi")
    headers = auth(session["token"])
    household_id = str(uuid.uuid4())

    push = client.post(
        "/api/sync/push",
        json={
            "households": [
                household_payload(household_id, updatedAt="2026-08-01T09:00:00Z"),
                household_payload(household_id, rev=1, updatedAt="2026-08-02T09:00:00Z"),
            ]
        },
        headers=headers,
    )

    results = push.json()["results"]
    assert [result["status"] for result in results] == ["accepted", "accepted"]
    assert [result["rev"] for result in results] == [1, 2]

    stored = client.get(f"/api/households/{household_id}", headers=headers).json()
    assert stored["rev"] == 2
    assert stored["updatedAt"] == "2026-08-02T09:00:00Z"


def test_ownership_cannot_be_reassigned_by_a_payload(client: TestClient) -> None:
    """A blank or stale enumeratorId on an update must not orphan the record."""
    session = sign_in(client, "9876500012", "enumerator", "Ravi")
    headers = auth(session["token"])
    household_id = str(uuid.uuid4())

    client.post(
        "/api/sync/push",
        json={"households": [household_payload(household_id)]},
        headers=headers,
    )

    client.post(
        "/api/sync/push",
        json={
            "households": [
                household_payload(
                    household_id,
                    rev=1,
                    enumeratorId="",
                    enumeratorName="",
                    updatedAt="2026-08-03T09:00:00Z",
                )
            ]
        },
        headers=headers,
    )

    stored = client.get(f"/api/households/{household_id}", headers=headers)
    assert stored.status_code == 200, "the record must still belong to its collector"
    assert stored.json()["enumeratorId"] == session["user"]["id"]
    assert stored.json()["enumeratorName"] == "Ravi"
