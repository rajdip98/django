"""Household records, offline sync and supervisor review."""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..deps import CurrentUser, Principal, get_store, record_audit
from ..models import (
    HouseholdIn,
    ReviewIn,
    SyncPullOut,
    SyncPushIn,
    SyncPushOut,
    SyncPushResult,
    now_iso,
)
from ..store import Store

router = APIRouter(prefix="/api", tags=["households"])

# Statuses a supervisor may set through the review endpoint.
REVIEW_STATUS = {
    "approved": "approved",
    "flagged": "flagged",
    "reopened": "submitted",
    "comment": None,
}


def _visible_to(principal: Principal, household: dict[str, Any]) -> bool:
    if principal.is_admin:
        return True
    if principal.role == "supervisor":
        # A supervisor with no zones assigned oversees the whole deployment,
        # which is the common case in a single-district installation.
        if not principal.zone_ids:
            return True
        return household.get("zoneId") in principal.zone_ids
    return household.get("enumeratorId") == principal.id


def _can_write(principal: Principal, existing: dict[str, Any] | None) -> bool:
    if existing is None:
        return True
    if principal.is_admin:
        return True
    if principal.role == "supervisor":
        return _visible_to(principal, existing)
    return existing.get("enumeratorId") == principal.id


def _merge(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    """Resolve a divergent push.

    The newer `updatedAt` wins, but a supervisor's decision is never silently
    reverted by an enumerator's offline edit: an approved or flagged status and
    the review trail survive the merge.
    """
    merged = dict(incoming)

    reviews_by_id = {review["id"]: review for review in existing.get("reviews", [])}
    for review in incoming.get("reviews", []):
        reviews_by_id.setdefault(review["id"], review)
    merged["reviews"] = sorted(reviews_by_id.values(), key=lambda review: review.get("at", ""))

    server_status = existing.get("status")
    if server_status in ("approved", "flagged") and incoming.get("status") in ("draft", "submitted"):
        merged["status"] = server_status

    # An acknowledgement number, once issued, is permanent.
    if existing.get("acknowledgementId") and not merged.get("acknowledgementId"):
        merged["acknowledgementId"] = existing["acknowledgementId"]

    merged["createdAt"] = existing.get("createdAt") or incoming.get("createdAt") or now_iso()
    return merged


@router.get("/households")
async def list_households(
    principal: CurrentUser,
    store: Annotated[Store, Depends(get_store)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    zone_id: Annotated[str | None, Query(alias="zone_id")] = None,
    enumerator_id: Annotated[str | None, Query(alias="enumerator_id")] = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 500,
) -> dict[str, list[dict[str, Any]]]:
    where: dict[str, Any] = {}
    if status_filter:
        where["status"] = status_filter
    if zone_id:
        where["zoneId"] = zone_id
    if enumerator_id:
        where["enumeratorId"] = enumerator_id

    rows = await store.find("households", where or None)
    visible = [row for row in rows if _visible_to(principal, row)]
    visible.sort(key=lambda row: row.get("updatedAt", ""), reverse=True)
    return {"households": visible[:limit]}


@router.get("/households/acknowledgement/{code}")
async def lookup_acknowledgement(
    code: str,
    store: Annotated[Store, Depends(get_store)],
) -> dict[str, Any]:
    """Public receipt lookup for citizens who self-enumerated.

    Returns only enough to confirm the household was counted — never the
    household's personal details, which would make acknowledgement numbers a
    data-leak vector.
    """
    record = await store.find_one("households", {"acknowledgementId": code.strip().upper()})
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such acknowledgement")
    return {
        "acknowledgementId": record.get("acknowledgementId"),
        "householdNumber": record.get("householdNumber"),
        "status": record.get("status"),
        "submittedAt": record.get("submittedAt"),
        "members": len(record.get("members", [])),
    }


@router.get("/households/{household_id}")
async def get_household(
    household_id: str,
    principal: CurrentUser,
    store: Annotated[Store, Depends(get_store)],
) -> dict[str, Any]:
    record = await store.get("households", household_id)
    if record is None or not _visible_to(principal, record):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Household not found")
    return record


@router.delete("/households/{household_id}")
async def delete_household(
    household_id: str,
    principal: CurrentUser,
    store: Annotated[Store, Depends(get_store)],
) -> dict[str, bool]:
    record = await store.get("households", household_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Household not found")
    if not _can_write(principal, record):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not permitted")
    if record.get("status") != "draft" and not principal.is_admin:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only drafts can be deleted; ask an administrator",
        )

    await store.delete("households", household_id)
    await record_audit(
        store,
        actor_id=principal.id,
        actor_name=principal.name,
        action="household.delete",
        target=record.get("householdNumber", household_id),
    )
    return {"ok": True}


@router.post("/sync/push", response_model=SyncPushOut)
async def sync_push(
    payload: SyncPushIn,
    principal: CurrentUser,
    store: Annotated[Store, Depends(get_store)],
) -> SyncPushOut:
    results: list[SyncPushResult] = []

    for item in payload.households:
        incoming = item.model_dump()
        existing = await store.get("households", incoming["id"])

        if not _can_write(principal, existing):
            results.append(
                SyncPushResult(
                    id=incoming["id"],
                    rev=existing.get("rev", 0) if existing else 0,
                    status="rejected",
                    message="You do not own this household",
                )
            )
            continue

        # Enumerators cannot reassign a record to someone else.
        if existing is None and not principal.is_supervisor:
            incoming["enumeratorId"] = principal.id
            incoming["enumeratorName"] = principal.name or incoming.get("enumeratorName", "")

        if not incoming.get("createdAt"):
            incoming["createdAt"] = now_iso()
        if not incoming.get("updatedAt"):
            incoming["updatedAt"] = now_iso()

        if existing is None:
            incoming["rev"] = 1
            saved = await store.put("households", incoming)
            results.append(SyncPushResult(id=saved["id"], rev=saved["rev"], status="accepted"))
            continue

        if int(existing.get("rev", 0)) == int(incoming.get("rev", 0)):
            incoming["rev"] = int(existing.get("rev", 0)) + 1
            incoming["createdAt"] = existing.get("createdAt", incoming["createdAt"])
            saved = await store.put("households", incoming)
            results.append(SyncPushResult(id=saved["id"], rev=saved["rev"], status="accepted"))
            continue

        # Divergent revisions: newest edit wins, with the review trail preserved.
        if str(incoming.get("updatedAt", "")) > str(existing.get("updatedAt", "")):
            merged = _merge(existing, incoming)
            merged["rev"] = int(existing.get("rev", 0)) + 1
            saved = await store.put("households", merged)
            results.append(SyncPushResult(id=saved["id"], rev=saved["rev"], status="accepted"))
        else:
            results.append(
                SyncPushResult(
                    id=existing["id"],
                    rev=int(existing.get("rev", 0)),
                    status="conflict",
                    message="A newer copy exists on the server",
                    household=existing,
                )
            )

    await record_audit(
        store,
        actor_id=principal.id,
        actor_name=principal.name,
        action="sync.push",
        target=f"{len(payload.households)} household(s)",
        detail=f"accepted={sum(1 for r in results if r.status == 'accepted')}",
    )

    return SyncPushOut(results=results)


@router.get("/sync/pull", response_model=SyncPullOut)
async def sync_pull(
    principal: CurrentUser,
    store: Annotated[Store, Depends(get_store)],
    since: Annotated[str | None, Query()] = None,
) -> SyncPullOut:
    rows = await store.find("households")
    households = [row for row in rows if _visible_to(principal, row)]

    if since:
        # ISO-8601 UTC strings sort lexicographically, so this is a safe compare.
        households = [row for row in households if str(row.get("updatedAt", "")) > since]

    households.sort(key=lambda row: row.get("updatedAt", ""))

    zones = await store.find("zones")
    users = await store.find("users") if principal.is_supervisor else []

    # Never ship anything sensitive in the cached user list.
    safe_users = [
        {
            "id": user.get("id"),
            "name": user.get("name", ""),
            "mobile": user.get("mobile", ""),
            "role": user.get("role", "enumerator"),
            "zoneIds": user.get("zoneIds", []),
            "employeeCode": user.get("employeeCode"),
            "active": user.get("active", True),
            "createdAt": user.get("createdAt", ""),
            "lastLoginAt": user.get("lastLoginAt"),
        }
        for user in users
    ]

    return SyncPullOut(
        households=households,
        zones=zones,
        users=safe_users,
        serverTime=now_iso(),
    )


@router.post("/households/{household_id}/review")
async def review_household(
    household_id: str,
    payload: ReviewIn,
    principal: CurrentUser,
    store: Annotated[Store, Depends(get_store)],
) -> dict[str, Any]:
    if not principal.is_supervisor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only supervisors can review households"
        )

    record = await store.get("households", household_id)
    if record is None or not _visible_to(principal, record):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Household not found")

    if payload.action != "approved" and not payload.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add a short note explaining the decision",
        )

    note = {
        "id": str(uuid.uuid4()),
        "by": principal.id,
        "byName": principal.name,
        "at": now_iso(),
        "action": payload.action,
        "text": payload.text.strip(),
    }

    record.setdefault("reviews", []).append(note)
    new_status = REVIEW_STATUS.get(payload.action)
    if new_status:
        record["status"] = new_status
    record["updatedAt"] = now_iso()
    record["rev"] = int(record.get("rev", 0)) + 1

    saved = await store.put("households", record)

    await record_audit(
        store,
        actor_id=principal.id,
        actor_name=principal.name,
        action=f"household.{payload.action}",
        target=saved.get("householdNumber", household_id),
        detail=payload.text.strip()[:200],
    )

    return saved
