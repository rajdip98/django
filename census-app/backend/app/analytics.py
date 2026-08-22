"""Server-side analytics — the same shape the frontend computes locally."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

AGE_BANDS: list[tuple[str, int, float]] = [
    ("band.0_6", 0, 6),
    ("band.7_14", 7, 14),
    ("band.15_29", 15, 29),
    ("band.30_44", 30, 44),
    ("band.45_59", 45, 59),
    ("band.60_plus", 60, float("inf")),
]


def _band_for(age: int) -> str:
    for key, low, high in AGE_BANDS:
        if low <= age <= high:
            return key
    return "band.60_plus"


def _day_key(value: str | None) -> str:
    if not value:
        return ""
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return value[:10] if len(value) >= 10 else ""
    return parsed.astimezone(timezone.utc).date().isoformat()


def _percent(part: int, total: int) -> float:
    if not total:
        return 0.0
    return round(part / total * 1000) / 10


def compute_summary(
    households: list[dict[str, Any]],
    zones: list[dict[str, Any]],
    users: list[dict[str, Any]],
) -> dict[str, Any]:
    gender_counts: dict[str, int] = {"male": 0, "female": 0, "transgender": 0}
    age_bands: dict[str, int] = {key: 0 for key, _, _ in AGE_BANDS}
    caste_counts: dict[str, int] = defaultdict(int)
    religion_counts: dict[str, int] = defaultdict(int)
    literacy = {"literate": 0, "illiterate": 0}
    daily: dict[str, int] = defaultdict(int)

    members = 0
    submitted = approved = flagged = drafts = 0

    for household in households:
        status = household.get("status", "draft")
        if status == "submitted":
            submitted += 1
        elif status == "approved":
            approved += 1
        elif status == "flagged":
            flagged += 1
        else:
            drafts += 1

        day = _day_key(household.get("submittedAt") or household.get("createdAt"))
        if day:
            daily[day] += 1

        for member in household.get("members", []):
            members += 1
            gender = member.get("gender")
            if gender:
                gender_counts[gender] = gender_counts.get(gender, 0) + 1

            age = member.get("age")
            if isinstance(age, int) and age >= 0:
                age_bands[_band_for(age)] += 1

            if member.get("casteCategory"):
                caste_counts[member["casteCategory"]] += 1
            if member.get("religion"):
                religion_counts[member["religion"]] += 1

            literate = member.get("literate")
            if literate is True:
                literacy["literate"] += 1
            elif literate is False:
                literacy["illiterate"] += 1

    # Zones -----------------------------------------------------------
    zone_progress = []
    known_zone_ids = set()
    for zone in zones:
        known_zone_ids.add(zone.get("id"))
        collected = sum(1 for h in households if h.get("zoneId") == zone.get("id"))
        target = int(zone.get("targetHouseholds", 0) or 0)
        zone_progress.append(
            {
                "zoneId": zone.get("id", ""),
                "zoneName": zone.get("name", ""),
                "collected": collected,
                "target": target,
                "coverage": _percent(collected, target),
            }
        )

    orphans = sum(1 for h in households if h.get("zoneId") not in known_zone_ids)
    if orphans:
        zone_progress.append(
            {
                "zoneId": "",
                "zoneName": "Unassigned",
                "collected": orphans,
                "target": 0,
                "coverage": 0.0,
            }
        )

    # Enumerators ------------------------------------------------------
    by_name = {user.get("id"): user.get("name", "") for user in users}
    progress: dict[str, dict[str, Any]] = {}
    for household in households:
        key = household.get("enumeratorId") or "unknown"
        entry = progress.setdefault(
            key,
            {
                "enumeratorId": key,
                "name": household.get("enumeratorName") or by_name.get(key) or "Unknown",
                "collected": 0,
                "submitted": 0,
                "approved": 0,
                "flagged": 0,
                "lastActivity": None,
            },
        )
        entry["collected"] += 1
        status = household.get("status")
        if status in ("submitted", "approved", "flagged"):
            entry[status] += 1
        updated = household.get("updatedAt")
        if updated and (entry["lastActivity"] is None or updated > entry["lastActivity"]):
            entry["lastActivity"] = updated

    # Last 14 days, zero-filled so the chart does not lie about quiet days.
    today = date.today()
    daily_counts = []
    for offset in range(13, -1, -1):
        key = (today - timedelta(days=offset)).isoformat()
        daily_counts.append({"date": key, "count": daily.get(key, 0)})

    target_total = sum(int(zone.get("targetHouseholds", 0) or 0) for zone in zones)

    return {
        "households": len(households),
        "members": members,
        "submitted": submitted,
        "approved": approved,
        "flagged": flagged,
        "drafts": drafts,
        "targetHouseholds": target_total,
        "coverage": _percent(len(households), target_total),
        "averageHouseholdSize": (
            round(members / len(households) * 10) / 10 if households else 0.0
        ),
        "genderCounts": dict(gender_counts),
        "ageBands": dict(age_bands),
        "literacy": literacy,
        "casteCounts": dict(caste_counts),
        "religionCounts": dict(religion_counts),
        "zoneProgress": sorted(zone_progress, key=lambda row: row["collected"], reverse=True),
        "enumeratorProgress": sorted(
            progress.values(), key=lambda row: row["collected"], reverse=True
        ),
        "dailyCounts": daily_counts,
    }
