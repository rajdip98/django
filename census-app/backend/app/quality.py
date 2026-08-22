"""Data-quality analysis for supervisors and administrators.

Double counting is the failure mode a census cannot tolerate: two enumerators
walking overlapping ground, or one revisiting a house already recorded, both
produce households that look perfectly valid on their own. This module finds
them, together with the coverage gaps that leave people uncounted.

The structural checks here run on the server rather than trusting the `flags`
a client uploaded. A stale or tampered client could send an empty flag list;
the report has to mean something regardless.
"""

from __future__ import annotations

import math
import re
from collections import defaultdict
from typing import Any, Iterable

# Two households recorded within this distance are very likely the same one.
# A typical urban dwelling frontage is 5-15 m, so 25 m is tight enough to avoid
# flagging genuine neighbours while still catching a revisit.
DUPLICATE_RADIUS_M = 25.0

# Grid cell used to avoid comparing every household with every other one.
# 0.0005 degrees is roughly 55 m, comfortably larger than the radius.
_CELL_DEGREES = 0.0005

EARTH_RADIUS_M = 6371000.0


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres."""
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def _point(household: dict[str, Any]) -> tuple[float, float] | None:
    location = household.get("location")
    if not isinstance(location, dict):
        return None
    lat, lng = location.get("lat"), location.get("lng")
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return float(lat), float(lng)


def _summary(household: dict[str, Any]) -> dict[str, Any]:
    """The fields a reviewer needs to recognise a household in a list."""
    address = household.get("address", {}) or {}
    location = household.get("location") if isinstance(household.get("location"), dict) else None
    return {
        "id": household.get("id", ""),
        "householdNumber": household.get("householdNumber", ""),
        "status": household.get("status", "draft"),
        "zoneId": household.get("zoneId", ""),
        "enumeratorId": household.get("enumeratorId", ""),
        "enumeratorName": household.get("enumeratorName", ""),
        "houseNumber": address.get("houseNumber", ""),
        "locality": address.get("village") or address.get("locality", ""),
        "district": address.get("district", ""),
        "members": len(household.get("members", []) or []),
        "location": location,
        "updatedAt": household.get("updatedAt", ""),
    }


class _Union:
    """Union-find, so overlapping duplicate pairs collapse into one cluster."""

    def __init__(self) -> None:
        self._parent: dict[str, str] = {}

    def find(self, item: str) -> str:
        self._parent.setdefault(item, item)
        root = item
        while self._parent[root] != root:
            root = self._parent[root]
        while self._parent[item] != root:  # path compression
            self._parent[item], item = root, self._parent[item]
        return root

    def union(self, left: str, right: str) -> None:
        left_root, right_root = self.find(left), self.find(right)
        if left_root != right_root:
            self._parent[right_root] = left_root

    def groups(self) -> dict[str, list[str]]:
        clustered: dict[str, list[str]] = defaultdict(list)
        for item in self._parent:
            clustered[self.find(item)].append(item)
        return clustered


def find_location_duplicates(
    households: Iterable[dict[str, Any]], radius_m: float = DUPLICATE_RADIUS_M
) -> list[dict[str, Any]]:
    """Group households recorded within `radius_m` of each other.

    Buckets by a coarse grid first and only compares within a cell and its eight
    neighbours, so this stays linear rather than comparing every pair.
    """
    located: list[tuple[dict[str, Any], float, float]] = []
    for household in households:
        point = _point(household)
        if point is not None:
            located.append((household, point[0], point[1]))

    buckets: dict[tuple[int, int], list[tuple[dict[str, Any], float, float]]] = defaultdict(list)
    for entry in located:
        _, lat, lng = entry
        buckets[(int(lat // _CELL_DEGREES), int(lng // _CELL_DEGREES))].append(entry)

    union = _Union()
    by_id = {entry[0].get("id", ""): entry[0] for entry in located}
    pair_distance: dict[str, float] = {}

    for (cell_y, cell_x), entries in buckets.items():
        neighbours: list[tuple[dict[str, Any], float, float]] = []
        for offset_y in (-1, 0, 1):
            for offset_x in (-1, 0, 1):
                neighbours.extend(buckets.get((cell_y + offset_y, cell_x + offset_x), []))

        for household, lat, lng in entries:
            left_id = household.get("id", "")
            for other, other_lat, other_lng in neighbours:
                right_id = other.get("id", "")
                # Compare each pair once, and never a household with itself.
                if not left_id or not right_id or left_id >= right_id:
                    continue
                distance = _distance_m(lat, lng, other_lat, other_lng)
                if distance <= radius_m:
                    union.union(left_id, right_id)
                    key = f"{left_id}|{right_id}"
                    pair_distance[key] = distance

    clusters: list[dict[str, Any]] = []
    for members in union.groups().values():
        if len(members) < 2:
            continue
        members.sort()
        closest = min(
            (
                distance
                for key, distance in pair_distance.items()
                if key.split("|")[0] in members and key.split("|")[1] in members
            ),
            default=0.0,
        )
        clusters.append(
            {
                "reason": "location",
                "distanceMeters": round(closest, 1),
                "households": [_summary(by_id[member]) for member in members if member in by_id],
            }
        )

    clusters.sort(key=lambda cluster: len(cluster["households"]), reverse=True)
    return clusters


def _address_key(household: dict[str, Any]) -> str | None:
    """A normalised address, or None when there is not enough to compare."""
    address = household.get("address", {}) or {}
    house = re.sub(r"[^a-z0-9]", "", str(address.get("houseNumber", "")).lower())
    place = re.sub(
        r"[^a-z0-9]", "", str(address.get("village") or address.get("locality") or "").lower()
    )
    if not house or not place:
        return None
    return f"{household.get('zoneId', '')}|{place}|{house}"


def find_address_duplicates(households: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Households sharing a house number within the same locality and zone."""
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for household in households:
        key = _address_key(household)
        if key:
            grouped[key].append(household)

    clusters = [
        {
            "reason": "address",
            "distanceMeters": None,
            "households": [_summary(item) for item in members],
        }
        for members in grouped.values()
        if len(members) > 1
    ]
    clusters.sort(key=lambda cluster: len(cluster["households"]), reverse=True)
    return clusters


def structural_issues(household: dict[str, Any]) -> list[str]:
    """Problems the server can see for itself, without trusting client flags."""
    issues: list[str] = []
    members = household.get("members", []) or []

    if not members:
        issues.append("no_members")
    else:
        heads = [m for m in members if m.get("relationToHead") == "head"]
        if not heads:
            issues.append("no_head")
        elif len(heads) > 1:
            issues.append("multiple_heads")

        for member in members:
            if not str(member.get("name", "")).strip():
                issues.append("member_name_missing")
                break
        for member in members:
            age = member.get("age")
            if age is None:
                issues.append("member_age_missing")
                break
            if not isinstance(age, int) or age < 0 or age > 120:
                issues.append("age_out_of_range")
                break
        for member in members:
            if not member.get("gender"):
                issues.append("member_gender_missing")
                break

    if _point(household) is None and household.get("collectedBy") == "enumerator":
        issues.append("location_missing")

    address = household.get("address", {}) or {}
    if not str(address.get("houseNumber", "")).strip():
        issues.append("house_number_missing")
    if not str(address.get("village") or address.get("locality") or "").strip():
        issues.append("locality_missing")

    return issues


def build_report(
    households: list[dict[str, Any]],
    zones: list[dict[str, Any]],
    radius_m: float = DUPLICATE_RADIUS_M,
) -> dict[str, Any]:
    """The whole quality picture for a set of households."""
    submitted = [h for h in households if h.get("status") != "draft"]

    missing_location = [
        _summary(h)
        for h in submitted
        if _point(h) is None and h.get("collectedBy") == "enumerator"
    ]

    known_zone_ids = {zone.get("id") for zone in zones}
    unassigned = [
        _summary(h)
        for h in submitted
        if not h.get("zoneId") or h.get("zoneId") not in known_zone_ids
    ]

    with_issues: list[dict[str, Any]] = []
    for household in submitted:
        issues = structural_issues(household)
        if issues:
            entry = _summary(household)
            entry["issues"] = issues
            with_issues.append(entry)

    location_clusters = find_location_duplicates(submitted, radius_m)
    address_clusters = find_address_duplicates(submitted)

    # A cluster already found by proximity should not be reported twice.
    located_ids = {
        item["id"] for cluster in location_clusters for item in cluster["households"]
    }
    address_clusters = [
        cluster
        for cluster in address_clusters
        if not all(item["id"] in located_ids for item in cluster["households"])
    ]

    # A household can survive in an address cluster while also sitting in a
    # location cluster (the address cluster is only dropped when *every*
    # member was already caught by location) — count it once either way.
    duplicate_ids = set(located_ids)
    duplicate_ids.update(
        item["id"] for cluster in address_clusters for item in cluster["households"]
    )
    duplicate_household_count = len(duplicate_ids)

    return {
        "generatedAt": None,  # filled in by the router, which owns the clock
        "radiusMeters": radius_m,
        "counts": {
            "reviewed": len(submitted),
            "missingLocation": len(missing_location),
            "unassigned": len(unassigned),
            "withIssues": len(with_issues),
            "duplicateClusters": len(location_clusters) + len(address_clusters),
            "duplicateHouseholds": duplicate_household_count,
        },
        "missingLocation": missing_location[:200],
        "unassigned": unassigned[:200],
        "withIssues": sorted(with_issues, key=lambda e: len(e["issues"]), reverse=True)[:200],
        "duplicates": (location_clusters + address_clusters)[:100],
    }
