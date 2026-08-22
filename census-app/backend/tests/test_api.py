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


def test_enumerator_cannot_forge_a_review_trail(client: TestClient) -> None:
    enumerator = sign_in(client, "9876500013", "enumerator", "Ravi")
    household_id = str(uuid.uuid4())

    forged = household_payload(household_id)
    forged["reviews"] = [
        {
            "id": str(uuid.uuid4()),
            "by": "someone",
            "byName": "Not A Supervisor",
            "at": "2026-08-01T10:00:00Z",
            "action": "approved",
            "text": "approved by me",
        }
    ]

    client.post(
        "/api/sync/push",
        json={"households": [forged]},
        headers=auth(enumerator["token"]),
    )

    stored = client.get(
        f"/api/households/{household_id}", headers=auth(enumerator["token"])
    ).json()
    assert stored["reviews"] == []


def test_supervisor_can_push_an_offline_review(client: TestClient) -> None:
    enumerator = sign_in(client, "9876500014", "enumerator", "Ravi")
    supervisor = sign_in(client, "9876500015", "supervisor", "Sunita")
    household_id = str(uuid.uuid4())

    client.post(
        "/api/sync/push",
        json={"households": [household_payload(household_id)]},
        headers=auth(enumerator["token"]),
    )

    offline_note = {
        "id": str(uuid.uuid4()),
        "by": supervisor["user"]["id"],
        "byName": "Sunita",
        "at": "2026-08-02T10:00:00Z",
        "action": "flagged",
        "text": "GPS looks wrong",
    }
    pushed = household_payload(
        household_id, rev=1, status="flagged", updatedAt="2026-08-02T10:00:00Z"
    )
    pushed["reviews"] = [offline_note]

    result = client.post(
        "/api/sync/push", json={"households": [pushed]}, headers=auth(supervisor["token"])
    )
    assert result.json()["results"][0]["status"] == "accepted"

    stored = client.get(
        f"/api/households/{household_id}", headers=auth(supervisor["token"])
    ).json()
    assert len(stored["reviews"]) == 1
    assert stored["reviews"][0]["text"] == "GPS looks wrong"


def test_oversized_request_body_is_refused(client: TestClient) -> None:
    session = sign_in(client, "9876500016", "enumerator", "Ravi")
    response = client.post(
        "/api/sync/push",
        content=b"x" * 16,
        headers={
            **auth(session["token"]),
            "Content-Type": "application/json",
            # Claim a body far larger than the 32 MB default.
            "Content-Length": str(64 * 1024 * 1024),
        },
    )
    assert response.status_code == 413


def test_pull_is_paged_and_resumable(client: TestClient, monkeypatch) -> None:
    """A first sync must not try to stream the whole dataset in one response."""
    from app.routers import households as households_router

    monkeypatch.setattr(households_router, "PULL_PAGE_SIZE", 3)

    session = sign_in(client, "9876500017", "enumerator", "Ravi")
    headers = auth(session["token"])

    batch = [
        household_payload(str(uuid.uuid4()), updatedAt=f"2026-08-{day:02d}T09:00:00Z")
        for day in range(1, 9)
    ]
    client.post("/api/sync/push", json={"households": batch}, headers=headers)

    seen: set[str] = set()
    cursor: str | None = None
    for _ in range(10):
        query = f"?since={cursor}" if cursor else ""
        page = client.get(f"/api/sync/pull{query}", headers=headers).json()
        seen.update(row["householdNumber"] + row["updatedAt"] for row in page["households"])
        cursor = page["serverTime"]
        if not page["hasMore"]:
            break

    # Every household is delivered exactly once across the pages.
    assert len(seen) == 8


def test_pull_page_keeps_identical_timestamps_together(client: TestClient, monkeypatch) -> None:
    """A tie split across a page boundary would be skipped by the next `since`."""
    from app.routers import households as households_router

    monkeypatch.setattr(households_router, "PULL_PAGE_SIZE", 2)

    session = sign_in(client, "9876500018", "enumerator", "Ravi")
    headers = auth(session["token"])

    # Four households sharing one timestamp, then a later one.
    batch = [
        household_payload(str(uuid.uuid4()), updatedAt="2026-08-01T09:00:00Z") for _ in range(4)
    ]
    batch.append(household_payload(str(uuid.uuid4()), updatedAt="2026-08-02T09:00:00Z"))
    client.post("/api/sync/push", json={"households": batch}, headers=headers)

    first = client.get("/api/sync/pull", headers=headers).json()
    # The page grew past PULL_PAGE_SIZE rather than splitting the tie.
    assert len(first["households"]) == 4
    assert first["hasMore"] is True

    second = client.get(f"/api/sync/pull?since={first['serverTime']}", headers=headers).json()
    assert len(second["households"]) == 1
    assert second["hasMore"] is False


def test_multi_worker_with_embedded_store_warns(tmp_path, monkeypatch, capsys) -> None:
    """Two workers on one JSON file lose data silently — say so loudly."""
    from app.store import FileStore, warn_if_multiprocess

    store = FileStore(tmp_path / "census.json")

    monkeypatch.setenv("WEB_CONCURRENCY", "4")
    warn_if_multiprocess(store)
    assert "WARNING" in capsys.readouterr().out

    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    warn_if_multiprocess(store)
    assert capsys.readouterr().out == ""

    # Never warns when a real database is configured.
    monkeypatch.setenv("WEB_CONCURRENCY", "8")
    from app.store import MongoStore

    warn_if_multiprocess(MongoStore("mongodb://example", "db"))
    assert capsys.readouterr().out == ""


# ---------------------------------------------------------------------------
# Field notices
# ---------------------------------------------------------------------------


def test_notice_lifecycle_and_audience(client: TestClient) -> None:
    admin = auth(admin_token(client))

    created = client.post(
        "/api/notices",
        json={
            "title": "Zone WB-04 reopens Monday",
            "body": "Resume house listing from door 41 onwards.",
            "audience": "enumerator",
            "level": "important",
        },
        headers=admin,
    )
    assert created.status_code == 200, created.text
    notice = created.json()
    assert notice["audience"] == "enumerator"
    assert notice["createdByName"] == "Administrator"

    client.post(
        "/api/notices",
        json={"title": "Weekly review at 5pm", "body": "All supervisors.", "audience": "supervisor"},
        headers=admin,
    )

    enumerator = sign_in(client, "9876511001", "enumerator", "Ravi")
    supervisor = sign_in(client, "9876511002", "supervisor", "Sunita")

    enumerator_titles = [
        n["title"] for n in client.get("/api/notices", headers=auth(enumerator["token"])).json()["notices"]
    ]
    supervisor_titles = [
        n["title"] for n in client.get("/api/notices", headers=auth(supervisor["token"])).json()["notices"]
    ]

    assert "Zone WB-04 reopens Monday" in enumerator_titles
    assert "Weekly review at 5pm" not in enumerator_titles
    assert "Weekly review at 5pm" in supervisor_titles
    assert "Zone WB-04 reopens Monday" not in supervisor_titles


def test_notice_addressed_to_all_reaches_everyone(client: TestClient) -> None:
    admin = auth(admin_token(client))
    client.post(
        "/api/notices",
        json={"title": "Census week begins", "body": "Start on 1 April.", "audience": "all"},
        headers=admin,
    )
    for mobile, role in (("9876511010", "enumerator"), ("9876511011", "supervisor")):
        session = sign_in(client, mobile, role, "Someone")
        titles = [n["title"] for n in client.get("/api/notices", headers=auth(session["token"])).json()["notices"]]
        assert "Census week begins" in titles


def test_withdrawn_notice_disappears_from_the_field(client: TestClient) -> None:
    admin = auth(admin_token(client))
    notice = client.post(
        "/api/notices", json={"title": "Temporary", "body": "Ignore this."}, headers=admin
    ).json()

    enumerator = sign_in(client, "9876511020", "enumerator", "Ravi")
    assert len(client.get("/api/notices", headers=auth(enumerator["token"])).json()["notices"]) == 1

    client.patch(f"/api/notices/{notice['id']}", json={"active": False}, headers=admin)
    assert client.get("/api/notices", headers=auth(enumerator["token"])).json()["notices"] == []

    # An administrator can still review what was withdrawn.
    withdrawn = client.get("/api/notices?include_inactive=true", headers=admin).json()["notices"]
    assert len(withdrawn) == 1


def test_only_admin_publishes_notices(client: TestClient) -> None:
    supervisor = sign_in(client, "9876511030", "supervisor", "Sunita")
    response = client.post(
        "/api/notices",
        json={"title": "Nope", "body": "Not allowed"},
        headers=auth(supervisor["token"]),
    )
    assert response.status_code == 403

    assert (
        client.get("/api/notices?include_inactive=true", headers=auth(supervisor["token"])).status_code
        == 403
    )


def test_urgent_notices_sort_first(client: TestClient) -> None:
    admin = auth(admin_token(client))
    for title, level in (("Routine", "info"), ("Evacuate zone 3", "urgent"), ("Read this", "important")):
        client.post("/api/notices", json={"title": title, "body": "x", "level": level}, headers=admin)

    enumerator = sign_in(client, "9876511040", "enumerator", "Ravi")
    titles = [n["title"] for n in client.get("/api/notices", headers=auth(enumerator["token"])).json()["notices"]]
    assert titles == ["Evacuate zone 3", "Read this", "Routine"]


def test_notices_ride_along_with_sync(client: TestClient) -> None:
    """An enumerator who is offline must still get the notice on next contact."""
    admin = auth(admin_token(client))
    client.post(
        "/api/notices",
        json={"title": "Ages in completed years", "body": "Not birth years.", "audience": "all"},
        headers=admin,
    )

    enumerator = sign_in(client, "9876511050", "enumerator", "Ravi")
    pulled = client.get("/api/sync/pull", headers=auth(enumerator["token"])).json()
    assert [n["title"] for n in pulled["notices"]] == ["Ages in completed years"]


def test_notice_requires_title_and_body(client: TestClient) -> None:
    admin = auth(admin_token(client))
    assert client.post("/api/notices", json={"title": "  ", "body": "x"}, headers=admin).status_code == 400
    assert client.post("/api/notices", json={"title": "x", "body": " "}, headers=admin).status_code == 400


# ---------------------------------------------------------------------------
# Data quality
# ---------------------------------------------------------------------------


def test_quality_report_finds_households_recorded_twice(client: TestClient) -> None:
    """The census failure that matters: the same house counted by two people."""
    first = sign_in(client, "9876512001", "enumerator", "Ravi")
    second = sign_in(client, "9876512002", "enumerator", "Priya")

    # Roughly 11 m apart — the same doorstep, recorded twice.
    a = household_payload(str(uuid.uuid4()))
    a["location"] = {"lat": 22.5726, "lng": 88.3639, "accuracy": 8.0}
    b = household_payload(str(uuid.uuid4()))
    b["location"] = {"lat": 22.5727, "lng": 88.3639, "accuracy": 8.0}
    b["address"] = {**b["address"], "houseNumber": "12B"}

    # ~200 m away: a genuine neighbour, not a duplicate.
    far = household_payload(str(uuid.uuid4()))
    far["location"] = {"lat": 22.5744, "lng": 88.3639, "accuracy": 8.0}
    far["address"] = {**far["address"], "houseNumber": "77"}

    client.post("/api/sync/push", json={"households": [a, far]}, headers=auth(first["token"]))
    client.post("/api/sync/push", json={"households": [b]}, headers=auth(second["token"]))

    report = client.get("/api/quality/report", headers=auth(admin_token(client))).json()

    assert report["counts"]["duplicateClusters"] == 1
    cluster = report["duplicates"][0]
    assert cluster["reason"] == "location"
    assert len(cluster["households"]) == 2
    assert 0 < cluster["distanceMeters"] < 25
    numbers = {h["householdNumber"] for h in cluster["households"]}
    assert far["householdNumber"] not in numbers


def test_quality_report_finds_the_same_address_twice(client: TestClient) -> None:
    session = sign_in(client, "9876512010", "enumerator", "Ravi")

    # Same house number and village, no GPS on either — the paper-form case.
    first = household_payload(str(uuid.uuid4()))
    first["location"] = None
    second = household_payload(str(uuid.uuid4()))
    second["location"] = None
    second["address"] = {**second["address"], "houseNumber": "12-a"}   # normalises to the same key

    client.post(
        "/api/sync/push", json={"households": [first, second]}, headers=auth(session["token"])
    )

    report = client.get("/api/quality/report", headers=auth(admin_token(client))).json()
    reasons = {cluster["reason"] for cluster in report["duplicates"]}
    assert "address" in reasons
    assert report["counts"]["missingLocation"] == 2


def test_quality_report_uses_its_own_checks_not_client_flags(client: TestClient) -> None:
    """A client that uploads an empty flag list must not hide a broken record."""
    session = sign_in(client, "9876512020", "enumerator", "Ravi")

    broken = household_payload(str(uuid.uuid4()))
    broken["members"] = []          # no members at all
    broken["flags"] = []            # and claims everything is fine
    client.post("/api/sync/push", json={"households": [broken]}, headers=auth(session["token"]))

    report = client.get("/api/quality/report", headers=auth(admin_token(client))).json()
    assert report["counts"]["withIssues"] == 1
    assert "no_members" in report["withIssues"][0]["issues"]


def test_quality_report_ignores_drafts(client: TestClient) -> None:
    session = sign_in(client, "9876512030", "enumerator", "Ravi")
    draft = household_payload(str(uuid.uuid4()), status="draft")
    draft["members"] = []
    client.post("/api/sync/push", json={"households": [draft]}, headers=auth(session["token"]))

    report = client.get("/api/quality/report", headers=auth(admin_token(client))).json()
    assert report["counts"]["reviewed"] == 0
    assert report["counts"]["withIssues"] == 0


def test_quality_report_needs_a_supervisor(client: TestClient) -> None:
    enumerator = sign_in(client, "9876512040", "enumerator", "Ravi")
    assert client.get("/api/quality/report", headers=auth(enumerator["token"])).status_code == 403


# ---------------------------------------------------------------------------
# Lookup and reassignment
# ---------------------------------------------------------------------------


def test_lookup_finds_a_household_by_number_or_acknowledgement(client: TestClient) -> None:
    session = sign_in(client, "9876513001", "enumerator", "Ravi")
    household = household_payload(str(uuid.uuid4()), acknowledgementId="CEN26-LOOKUP01")
    client.post("/api/sync/push", json={"households": [household]}, headers=auth(session["token"]))

    admin = auth(admin_token(client))
    by_number = client.get(
        f"/api/households/lookup?q={household['householdNumber']}", headers=admin
    ).json()["households"]
    assert len(by_number) == 1

    by_ack = client.get("/api/households/lookup?q=CEN26-LOOKUP01", headers=admin).json()["households"]
    assert len(by_ack) == 1

    by_member = client.get("/api/households/lookup?q=Asha", headers=admin).json()["households"]
    assert len(by_member) == 1

    assert client.get("/api/households/lookup?q=nothing-here", headers=admin).json()["households"] == []


def test_lookup_respects_what_the_caller_may_see(client: TestClient) -> None:
    owner = sign_in(client, "9876513010", "enumerator", "Ravi")
    other = sign_in(client, "9876513011", "enumerator", "Priya")

    household = household_payload(str(uuid.uuid4()))
    client.post("/api/sync/push", json={"households": [household]}, headers=auth(owner["token"]))

    found = client.get(
        f"/api/households/lookup?q={household['householdNumber']}", headers=auth(other["token"])
    ).json()["households"]
    assert found == []


def test_reassigning_a_household_moves_it_to_the_new_enumerator(client: TestClient) -> None:
    leaver = sign_in(client, "9876513020", "enumerator", "Ravi")
    successor = sign_in(client, "9876513021", "enumerator", "Priya")
    admin = auth(admin_token(client))

    household_id = str(uuid.uuid4())
    client.post(
        "/api/sync/push",
        json={"households": [household_payload(household_id)]},
        headers=auth(leaver["token"]),
    )

    moved = client.post(
        f"/api/households/{household_id}/reassign",
        json={"enumeratorId": successor["user"]["id"], "reason": "Ravi left the team"},
        headers=admin,
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["enumeratorName"] == "Priya"

    # The new owner can see it; the old one no longer can.
    assert client.get(
        f"/api/households/{household_id}", headers=auth(successor["token"])
    ).status_code == 200
    assert client.get(
        f"/api/households/{household_id}", headers=auth(leaver["token"])
    ).status_code == 404

    actions = {e["action"] for e in client.get("/api/audit", headers=admin).json()["entries"]}
    assert "household.reassign" in actions


def test_reassignment_is_admin_only_and_checks_the_target(client: TestClient) -> None:
    owner = sign_in(client, "9876513030", "enumerator", "Ravi")
    supervisor = sign_in(client, "9876513031", "supervisor", "Sunita")
    household_id = str(uuid.uuid4())
    client.post(
        "/api/sync/push",
        json={"households": [household_payload(household_id)]},
        headers=auth(owner["token"]),
    )

    assert client.post(
        f"/api/households/{household_id}/reassign",
        json={"enumeratorId": owner["user"]["id"]},
        headers=auth(supervisor["token"]),
    ).status_code == 403

    assert client.post(
        f"/api/households/{household_id}/reassign",
        json={"enumeratorId": "no-such-user"},
        headers=auth(admin_token(client)),
    ).status_code == 404


def test_export_carries_a_google_maps_link(client: TestClient) -> None:
    session = sign_in(client, "9876514001", "enumerator", "Ravi")
    client.post(
        "/api/sync/push",
        json={"households": [household_payload(str(uuid.uuid4()))]},
        headers=auth(session["token"]),
    )

    csv_text = client.get(
        "/api/export?format=csv&scope=households", headers=auth(admin_token(client))
    ).text
    assert "google_maps_url" in csv_text
    assert "https://www.google.com/maps/search/?api=1&query=22.5726,88.3639" in csv_text
