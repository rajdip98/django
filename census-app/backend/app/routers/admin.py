"""Administration: users, zones, analytics, export and the audit log."""

from __future__ import annotations

import csv
import io
import json
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from ..analytics import compute_summary
from ..deps import CurrentUser, RequireAdmin, RequireSupervisor, get_store, record_audit
from ..models import AuditEntryOut, UserIn, UserOut, ZoneIn, ZoneOut, now_iso
from ..store import Store

router = APIRouter(prefix="/api", tags=["admin"])


def _normalise_mobile(value: str) -> str:
    digits = "".join(character for character in value if character.isdigit())
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    return digits[-10:] if len(digits) >= 10 else digits


# --------------------------------------------------------------------------
# Users
# --------------------------------------------------------------------------


@router.get("/users")
async def list_users(
    _: RequireSupervisor,
    store: Annotated[Store, Depends(get_store)],
) -> dict[str, list[UserOut]]:
    rows = await store.find("users")
    rows.sort(key=lambda row: row.get("name", ""))
    return {"users": [UserOut.model_validate(row) for row in rows]}


@router.post("/users", response_model=UserOut)
async def create_user(
    payload: UserIn,
    principal: RequireAdmin,
    store: Annotated[Store, Depends(get_store)],
) -> UserOut:
    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name is required")

    role = payload.role or "enumerator"
    mobile = _normalise_mobile(payload.mobile or "")

    if role != "admin":
        if len(mobile) != 10 or mobile[0] not in "6789":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Enter a valid 10-digit Indian mobile number",
            )
        clash = await store.find_one("users", {"mobile": mobile})
        if clash is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another user already uses that mobile number",
            )

    record: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "mobile": mobile,
        "role": role,
        "zoneIds": payload.zoneIds or [],
        "employeeCode": (payload.employeeCode or "").strip() or None,
        "supervisorId": payload.supervisorId,
        "active": True if payload.active is None else payload.active,
        "createdAt": now_iso(),
    }

    saved = await store.put("users", record)
    await record_audit(
        store,
        actor_id=principal.id,
        actor_name=principal.name,
        action="user.create",
        target=saved["name"],
        detail=f"role={role}",
    )
    return UserOut.model_validate(saved)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    payload: UserIn,
    principal: RequireAdmin,
    store: Annotated[Store, Depends(get_store)],
) -> UserOut:
    record = await store.get("users", user_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.name is not None and payload.name.strip():
        record["name"] = payload.name.strip()
    if payload.mobile is not None:
        mobile = _normalise_mobile(payload.mobile)
        if record.get("role") != "admin" and (len(mobile) != 10 or mobile[0] not in "6789"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Enter a valid 10-digit Indian mobile number",
            )
        clash = await store.find_one("users", {"mobile": mobile})
        if clash is not None and clash.get("id") != user_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another user already uses that mobile number",
            )
        record["mobile"] = mobile
    if payload.role is not None:
        record["role"] = payload.role
    if payload.zoneIds is not None:
        record["zoneIds"] = payload.zoneIds
    if payload.employeeCode is not None:
        record["employeeCode"] = payload.employeeCode.strip() or None
    if payload.supervisorId is not None:
        record["supervisorId"] = payload.supervisorId
    if payload.active is not None:
        record["active"] = payload.active

    saved = await store.put("users", record)
    await record_audit(
        store,
        actor_id=principal.id,
        actor_name=principal.name,
        action="user.update",
        target=saved.get("name", user_id),
    )
    return UserOut.model_validate(saved)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    principal: RequireAdmin,
    store: Annotated[Store, Depends(get_store)],
) -> dict[str, bool]:
    record = await store.get("users", user_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    collected = await store.count("households", {"enumeratorId": user_id})
    if collected:
        # Deleting would orphan their households; deactivate instead so the
        # data keeps a traceable owner.
        record["active"] = False
        await store.put("users", record)
        await record_audit(
            store,
            actor_id=principal.id,
            actor_name=principal.name,
            action="user.deactivate",
            target=record.get("name", user_id),
            detail=f"{collected} household(s) collected",
        )
        return {"ok": True}

    await store.delete("users", user_id)
    await record_audit(
        store,
        actor_id=principal.id,
        actor_name=principal.name,
        action="user.delete",
        target=record.get("name", user_id),
    )
    return {"ok": True}


# --------------------------------------------------------------------------
# Zones
# --------------------------------------------------------------------------


@router.get("/zones")
async def list_zones(
    _: CurrentUser,
    store: Annotated[Store, Depends(get_store)],
) -> dict[str, list[ZoneOut]]:
    rows = await store.find("zones")
    rows.sort(key=lambda row: row.get("name", ""))
    return {"zones": [ZoneOut.model_validate(row) for row in rows]}


@router.post("/zones", response_model=ZoneOut)
async def create_zone(
    payload: ZoneIn,
    principal: RequireAdmin,
    store: Annotated[Store, Depends(get_store)],
) -> ZoneOut:
    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Zone name is required")
    if not payload.code or not payload.code.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Zone code is required")

    code = payload.code.strip().upper()
    if await store.find_one("zones", {"code": code}) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That zone code is taken")

    record: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "code": code,
        "name": payload.name.strip(),
        "district": (payload.district or "").strip(),
        "state": (payload.state or "").strip(),
        "targetHouseholds": max(0, payload.targetHouseholds or 0),
        "center": payload.center.model_dump() if payload.center else None,
        "assignedTo": payload.assignedTo or [],
    }

    saved = await store.put("zones", record)
    await record_audit(
        store,
        actor_id=principal.id,
        actor_name=principal.name,
        action="zone.create",
        target=saved["name"],
    )
    return ZoneOut.model_validate(saved)


@router.patch("/zones/{zone_id}", response_model=ZoneOut)
async def update_zone(
    zone_id: str,
    payload: ZoneIn,
    principal: RequireAdmin,
    store: Annotated[Store, Depends(get_store)],
) -> ZoneOut:
    record = await store.get("zones", zone_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")

    if payload.code is not None and payload.code.strip():
        code = payload.code.strip().upper()
        clash = await store.find_one("zones", {"code": code})
        if clash is not None and clash.get("id") != zone_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="That zone code is taken"
            )
        record["code"] = code
    if payload.name is not None and payload.name.strip():
        record["name"] = payload.name.strip()
    if payload.district is not None:
        record["district"] = payload.district.strip()
    if payload.state is not None:
        record["state"] = payload.state.strip()
    if payload.targetHouseholds is not None:
        record["targetHouseholds"] = max(0, payload.targetHouseholds)
    if payload.center is not None:
        record["center"] = payload.center.model_dump()
    if payload.assignedTo is not None:
        record["assignedTo"] = payload.assignedTo

    saved = await store.put("zones", record)
    await record_audit(
        store,
        actor_id=principal.id,
        actor_name=principal.name,
        action="zone.update",
        target=saved.get("name", zone_id),
    )
    return ZoneOut.model_validate(saved)


@router.delete("/zones/{zone_id}")
async def delete_zone(
    zone_id: str,
    principal: RequireAdmin,
    store: Annotated[Store, Depends(get_store)],
) -> dict[str, bool]:
    record = await store.get("zones", zone_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")

    used = await store.count("households", {"zoneId": zone_id})
    if used:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{used} household(s) are recorded in this zone",
        )

    await store.delete("zones", zone_id)
    await record_audit(
        store,
        actor_id=principal.id,
        actor_name=principal.name,
        action="zone.delete",
        target=record.get("name", zone_id),
    )
    return {"ok": True}


# --------------------------------------------------------------------------
# Analytics
# --------------------------------------------------------------------------


@router.get("/analytics/summary")
async def analytics_summary(
    principal: RequireSupervisor,
    store: Annotated[Store, Depends(get_store)],
    zone_id: Annotated[str | None, Query(alias="zone_id")] = None,
) -> dict[str, Any]:
    households = await store.find("households")

    if not principal.is_admin and principal.zone_ids:
        households = [row for row in households if row.get("zoneId") in principal.zone_ids]
    if zone_id:
        households = [row for row in households if row.get("zoneId") == zone_id]

    zones = await store.find("zones")
    if not principal.is_admin and principal.zone_ids:
        zones = [zone for zone in zones if zone.get("id") in principal.zone_ids]
    if zone_id:
        zones = [zone for zone in zones if zone.get("id") == zone_id]

    users = await store.find("users")
    return compute_summary(households, zones, users)


# --------------------------------------------------------------------------
# Export
# --------------------------------------------------------------------------

HOUSEHOLD_COLUMNS = [
    "household_number",
    "acknowledgement_id",
    "status",
    "zone_id",
    "collected_by",
    "enumerator_name",
    "latitude",
    "longitude",
    "gps_accuracy_m",
    "house_number",
    "building_name",
    "street",
    "locality",
    "village",
    "tehsil",
    "district",
    "state",
    "pincode",
    "building_type",
    "ownership",
    "rooms",
    "married_couples",
    "separate_kitchen",
    "bathroom",
    "water_source",
    "water_within_premises",
    "toilet",
    "drainage",
    "lighting",
    "cooking_fuel",
    "assets",
    "members",
    "created_at",
    "updated_at",
    "submitted_at",
]

MEMBER_COLUMNS = [
    "household_number",
    "zone_id",
    "district",
    "state",
    "member_index",
    "name",
    "relation_to_head",
    "gender",
    "age",
    "marital_status",
    "age_at_marriage",
    "religion",
    "caste_category",
    "mother_tongue",
    "other_languages",
    "literate",
    "education",
    "attending_education",
    "economic_activity",
    "occupation",
    "industry",
    "disability",
    "birth_place",
    "last_residence",
    "migration_reason",
    "mobile",
]


def _bool_text(value: Any) -> str:
    if value is True:
        return "yes"
    if value is False:
        return "no"
    return ""


def _household_row(household: dict[str, Any]) -> dict[str, Any]:
    address = household.get("address", {}) or {}
    housing = household.get("housing", {}) or {}
    location = household.get("location") or {}
    accuracy = location.get("accuracy")
    return {
        "household_number": household.get("householdNumber", ""),
        "acknowledgement_id": household.get("acknowledgementId") or "",
        "status": household.get("status", ""),
        "zone_id": household.get("zoneId", ""),
        "collected_by": household.get("collectedBy", ""),
        "enumerator_name": household.get("enumeratorName", ""),
        "latitude": location.get("lat", ""),
        "longitude": location.get("lng", ""),
        "gps_accuracy_m": round(accuracy) if isinstance(accuracy, (int, float)) else "",
        "house_number": address.get("houseNumber", ""),
        "building_name": address.get("buildingName", ""),
        "street": address.get("street", ""),
        "locality": address.get("locality", ""),
        "village": address.get("village", ""),
        "tehsil": address.get("tehsil", ""),
        "district": address.get("district", ""),
        "state": address.get("state", ""),
        "pincode": address.get("pincode", ""),
        "building_type": housing.get("buildingType", ""),
        "ownership": housing.get("ownership", ""),
        "rooms": housing.get("rooms") if housing.get("rooms") is not None else "",
        "married_couples": (
            housing.get("marriedCouples") if housing.get("marriedCouples") is not None else ""
        ),
        "separate_kitchen": _bool_text(housing.get("hasSeparateKitchen")),
        "bathroom": _bool_text(housing.get("hasBathroom")),
        "water_source": housing.get("waterSource", ""),
        "water_within_premises": _bool_text(housing.get("waterWithinPremises")),
        "toilet": housing.get("toilet", ""),
        "drainage": housing.get("drainage", ""),
        "lighting": housing.get("lighting", ""),
        "cooking_fuel": housing.get("cookingFuel", ""),
        "assets": "|".join(housing.get("assets", []) or []),
        "members": len(household.get("members", [])),
        "created_at": household.get("createdAt", ""),
        "updated_at": household.get("updatedAt", ""),
        "submitted_at": household.get("submittedAt") or "",
    }


def _member_rows(household: dict[str, Any]) -> list[dict[str, Any]]:
    address = household.get("address", {}) or {}
    rows = []
    for index, member in enumerate(household.get("members", []), start=1):
        rows.append(
            {
                "household_number": household.get("householdNumber", ""),
                "zone_id": household.get("zoneId", ""),
                "district": address.get("district", ""),
                "state": address.get("state", ""),
                "member_index": index,
                "name": member.get("name", ""),
                "relation_to_head": member.get("relationToHead", ""),
                "gender": member.get("gender", ""),
                "age": member.get("age") if member.get("age") is not None else "",
                "marital_status": member.get("maritalStatus", ""),
                "age_at_marriage": (
                    member.get("ageAtMarriage") if member.get("ageAtMarriage") is not None else ""
                ),
                "religion": member.get("religion", ""),
                "caste_category": member.get("casteCategory", ""),
                "mother_tongue": member.get("motherTongue", ""),
                "other_languages": member.get("otherLanguages", ""),
                "literate": _bool_text(member.get("literate")),
                "education": member.get("education", ""),
                "attending_education": _bool_text(member.get("attendingEducation")),
                "economic_activity": member.get("economicActivity", ""),
                "occupation": member.get("occupation", ""),
                "industry": member.get("industry", ""),
                "disability": member.get("disability", ""),
                "birth_place": member.get("birthPlace", ""),
                "last_residence": member.get("lastResidence", ""),
                "migration_reason": member.get("migrationReason", ""),
                "mobile": member.get("mobile", ""),
            }
        )
    return rows


@router.get("/export")
async def export_data(
    principal: RequireSupervisor,
    store: Annotated[Store, Depends(get_store)],
    export_format: Annotated[str, Query(alias="format")] = "csv",
    scope: Annotated[str, Query()] = "households",
) -> Response:
    if export_format not in ("csv", "json"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported format")
    if scope not in ("households", "members"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported scope")

    households = await store.find("households")
    if not principal.is_admin and principal.zone_ids:
        households = [row for row in households if row.get("zoneId") in principal.zone_ids]
    households.sort(key=lambda row: row.get("createdAt", ""))

    stamp = now_iso()[:10]
    await record_audit(
        store,
        actor_id=principal.id,
        actor_name=principal.name,
        action="data.export",
        target=f"{scope}.{export_format}",
        detail=f"{len(households)} household(s)",
    )

    if export_format == "json":
        payload = {
            "format": "india-census-2026",
            "version": 1,
            "exportedAt": now_iso(),
            "households": households,
        }
        return Response(
            content=json.dumps(payload, ensure_ascii=False, indent=2),
            media_type="application/json; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="census-{scope}-{stamp}.json"'
            },
        )

    columns = HOUSEHOLD_COLUMNS if scope == "households" else MEMBER_COLUMNS
    rows: list[dict[str, Any]] = []
    for household in households:
        if scope == "households":
            rows.append(_household_row(household))
        else:
            rows.extend(_member_rows(household))

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)

    # UTF-8 BOM so Excel renders Devanagari, Bengali and Tamil correctly.
    body = "﻿" + buffer.getvalue()
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="census-{scope}-{stamp}.csv"'},
    )


# --------------------------------------------------------------------------
# Audit
# --------------------------------------------------------------------------


@router.get("/audit")
async def audit_log(
    _: RequireAdmin,
    store: Annotated[Store, Depends(get_store)],
    limit: Annotated[int, Query(ge=1, le=1000)] = 200,
) -> dict[str, list[AuditEntryOut]]:
    rows = await store.find("audit")
    rows.sort(key=lambda row: row.get("at", ""), reverse=True)
    return {"entries": [AuditEntryOut.model_validate(row) for row in rows[:limit]]}
