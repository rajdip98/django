"""Request/response schemas.

Mirrors the TypeScript domain model in `frontend/src/lib/types.ts`. Unknown
fields are dropped rather than stored, so a stale or tampered client cannot
write arbitrary keys into the database.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Role = Literal["enumerator", "citizen", "supervisor", "admin"]
HouseholdStatus = Literal["draft", "submitted", "approved", "flagged"]
ReviewAction = Literal["approved", "flagged", "comment", "reopened"]

MAX_PHOTOS_PER_HOUSEHOLD = 6
MAX_PHOTO_CHARS = 3_000_000  # ~2.2 MB decoded
MAX_MEMBERS_PER_HOUSEHOLD = 40
MAX_HOUSEHOLDS_PER_PUSH = 200


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class Strict(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------


class OtpRequestIn(Strict):
    mobile: str
    role: Role

    @field_validator("mobile")
    @classmethod
    def _check_mobile(cls, value: str) -> str:
        digits = "".join(character for character in value if character.isdigit())
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        if len(digits) != 10 or digits[0] not in "6789":
            raise ValueError("Enter a valid 10-digit Indian mobile number")
        return digits


class OtpChallengeOut(Strict):
    requestId: str
    expiresInSeconds: int
    devOtp: str | None = None


class OtpVerifyIn(Strict):
    requestId: str
    mobile: str
    otp: str
    role: Role
    name: str | None = None

    @field_validator("otp")
    @classmethod
    def _check_otp(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned.isdigit() or len(cleaned) != 6:
            raise ValueError("The code must be 6 digits")
        return cleaned


class AdminLoginIn(Strict):
    password: str


class UserOut(Strict):
    id: str
    name: str
    mobile: str
    role: Role
    zoneIds: list[str] = Field(default_factory=list)
    employeeCode: str | None = None
    supervisorId: str | None = None
    active: bool = True
    createdAt: str
    lastLoginAt: str | None = None


class AuthOut(Strict):
    token: str
    user: UserOut


class UserIn(Strict):
    id: str | None = None
    name: str | None = None
    mobile: str | None = None
    role: Role | None = None
    zoneIds: list[str] | None = None
    employeeCode: str | None = None
    supervisorId: str | None = None
    active: bool | None = None


# --------------------------------------------------------------------------
# Zones
# --------------------------------------------------------------------------


class GeoPoint(Strict):
    lat: float
    lng: float
    accuracy: float | None = None
    capturedAt: str | None = None

    @field_validator("lat")
    @classmethod
    def _check_lat(cls, value: float) -> float:
        if not -90 <= value <= 90:
            raise ValueError("Latitude out of range")
        return value

    @field_validator("lng")
    @classmethod
    def _check_lng(cls, value: float) -> float:
        if not -180 <= value <= 180:
            raise ValueError("Longitude out of range")
        return value


class ZoneIn(Strict):
    id: str | None = None
    code: str | None = None
    name: str | None = None
    district: str | None = None
    state: str | None = None
    targetHouseholds: int | None = None
    center: GeoPoint | None = None
    assignedTo: list[str] | None = None


class ZoneOut(Strict):
    id: str
    code: str
    name: str
    district: str = ""
    state: str = ""
    targetHouseholds: int = 0
    center: GeoPoint | None = None
    assignedTo: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Households
# --------------------------------------------------------------------------


class Address(Strict):
    houseNumber: str = ""
    buildingName: str = ""
    street: str = ""
    locality: str = ""
    village: str = ""
    tehsil: str = ""
    district: str = ""
    state: str = ""
    pincode: str = ""


class Housing(Strict):
    buildingType: str = ""
    ownership: str = ""
    rooms: int | None = None
    marriedCouples: int | None = None
    hasSeparateKitchen: bool | None = None
    hasBathroom: bool | None = None
    waterSource: str = ""
    waterWithinPremises: bool | None = None
    toilet: str = ""
    drainage: str = ""
    lighting: str = ""
    cookingFuel: str = ""
    assets: list[str] = Field(default_factory=list)


class Member(Strict):
    id: str
    name: str = ""
    relationToHead: str = ""
    gender: str = ""
    age: int | None = None
    maritalStatus: str = ""
    ageAtMarriage: int | None = None
    religion: str = ""
    casteCategory: str = ""
    motherTongue: str = ""
    otherLanguages: str = ""
    literate: bool | None = None
    education: str = ""
    attendingEducation: bool | None = None
    economicActivity: str = ""
    occupation: str = ""
    industry: str = ""
    disability: str = ""
    birthPlace: str = ""
    lastResidence: str = ""
    migrationReason: str = ""
    mobile: str = ""

    @field_validator("age", "ageAtMarriage")
    @classmethod
    def _check_age(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if not 0 <= value <= 120:
            raise ValueError("Age must be between 0 and 120")
        return value


class Photo(Strict):
    id: str
    dataUrl: str
    caption: str = ""
    capturedAt: str = ""

    @field_validator("dataUrl")
    @classmethod
    def _check_data_url(cls, value: str) -> str:
        if not value.startswith("data:image/"):
            raise ValueError("Photo must be an inline image data URL")
        if len(value) > MAX_PHOTO_CHARS:
            raise ValueError("Photo is too large; the app should down-scale before syncing")
        return value


class ValidationFlag(Strict):
    code: str
    severity: Literal["error", "warning", "info"]
    messageKey: str
    values: dict[str, Any] | None = None
    memberId: str | None = None
    field: str | None = None


class ReviewNote(Strict):
    id: str
    by: str = ""
    byName: str = ""
    at: str = ""
    action: ReviewAction
    text: str = ""


class HouseholdIn(Strict):
    id: str
    householdNumber: str = ""
    acknowledgementId: str | None = None
    status: HouseholdStatus = "draft"
    zoneId: str = ""
    collectedBy: Literal["enumerator", "citizen"] = "enumerator"
    enumeratorId: str = ""
    enumeratorName: str = ""
    location: GeoPoint | None = None
    address: Address = Field(default_factory=Address)
    housing: Housing = Field(default_factory=Housing)
    members: list[Member] = Field(default_factory=list)
    photos: list[Photo] = Field(default_factory=list)
    notes: str = ""
    language: str = "en"
    flags: list[ValidationFlag] = Field(default_factory=list)
    reviews: list[ReviewNote] = Field(default_factory=list)
    createdAt: str = ""
    updatedAt: str = ""
    submittedAt: str | None = None
    rev: int = 0

    @field_validator("members")
    @classmethod
    def _check_members(cls, value: list[Member]) -> list[Member]:
        if len(value) > MAX_MEMBERS_PER_HOUSEHOLD:
            raise ValueError(f"A household cannot have more than {MAX_MEMBERS_PER_HOUSEHOLD} members")
        return value

    @field_validator("photos")
    @classmethod
    def _check_photos(cls, value: list[Photo]) -> list[Photo]:
        if len(value) > MAX_PHOTOS_PER_HOUSEHOLD:
            raise ValueError(f"At most {MAX_PHOTOS_PER_HOUSEHOLD} photos per household")
        return value

    @field_validator("id")
    @classmethod
    def _check_id(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Household id is required")
        return value


class SyncPushIn(Strict):
    households: list[HouseholdIn]

    @field_validator("households")
    @classmethod
    def _check_batch(cls, value: list[HouseholdIn]) -> list[HouseholdIn]:
        if len(value) > MAX_HOUSEHOLDS_PER_PUSH:
            raise ValueError(f"Send at most {MAX_HOUSEHOLDS_PER_PUSH} households per request")
        return value


class SyncPushResult(Strict):
    id: str
    rev: int
    status: Literal["accepted", "conflict", "rejected"]
    message: str | None = None
    household: dict[str, Any] | None = None


class SyncPushOut(Strict):
    results: list[SyncPushResult]


class SyncPullOut(Strict):
    households: list[dict[str, Any]]
    zones: list[dict[str, Any]]
    users: list[dict[str, Any]]
    serverTime: str
    """Cursor for the next pull — the clock, or the last timestamp of a page."""
    hasMore: bool = False


class ReviewIn(Strict):
    action: ReviewAction
    text: str = ""


class AuditEntryOut(Strict):
    id: str
    at: str
    actorId: str
    actorName: str
    action: str
    target: str
    detail: str = ""


class HealthOut(Strict):
    status: str
    version: str
    database: str
    smsEnabled: bool
    aiEnabled: bool
    serverTime: str


class AiValidateIn(Strict):
    household: HouseholdIn


class AiIssue(Strict):
    memberId: str | None = None
    field: str | None = None
    severity: Literal["error", "warning", "info"] = "warning"
    message: str


class AiValidateOut(Strict):
    issues: list[AiIssue]


class AiTranslateIn(Strict):
    text: str
    targetLanguage: str

    @field_validator("text")
    @classmethod
    def _check_text(cls, value: str) -> str:
        if len(value) > 5000:
            raise ValueError("Text is too long to translate in one request")
        return value


class AiTranslateOut(Strict):
    text: str
    provider: str
