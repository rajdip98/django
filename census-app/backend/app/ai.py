"""Optional AI assistance.

Disabled unless AI_BASE_URL and AI_API_KEY are set. Any OpenAI-compatible
chat-completions endpoint works — Google's Gemini compatibility endpoint,
OpenAI, or a self-hosted model.

Privacy note: enabling this sends household data to whichever provider you
configure. Census returns are confidential under the Census Act, 1948, so the
rule-based validator in the app (which never leaves the device) is the default,
and this is strictly opt-in. Photographs and mobile numbers are stripped before
anything is sent.
"""

from __future__ import annotations

import json
from typing import Any

from .config import Settings

SYSTEM_PROMPT = (
    "You are a data-quality assistant for the Census of India. "
    "You are given one household record as JSON. Identify factual inconsistencies "
    "a supervisor should check — for example an age that does not fit the stated "
    "education, relationships that cannot all be true at once, or housing answers "
    "that contradict each other. Do not repeat obvious missing-field warnings. "
    'Reply with JSON only, in the form {"issues": [{"memberId": string|null, '
    '"field": string|null, "severity": "error"|"warning"|"info", "message": string}]}. '
    "Keep each message under 140 characters. If nothing is wrong, return an empty list."
)

TRANSLATE_PROMPT = (
    "Translate the user's text into {language}. Reply with the translation only — "
    "no explanation, no quotation marks, no transliteration."
)

LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi",
    "bn": "Bengali",
    "ta": "Tamil",
    "te": "Telugu",
    "mr": "Marathi",
    "gu": "Gujarati",
}


class AiUnavailable(Exception):
    """Raised when AI features are requested but not configured or reachable."""


def redact(household: dict[str, Any]) -> dict[str, Any]:
    """Strip identifying and bulky fields before sending anything off-box."""
    safe = {
        key: value
        for key, value in household.items()
        if key not in ("photos", "reviews", "notes", "flags")
    }

    members = []
    for member in safe.get("members", []):
        member_copy = dict(member)
        member_copy.pop("mobile", None)
        # Names add nothing to a consistency check and are the most sensitive
        # field, so they are dropped rather than blanked in place.
        member_copy.pop("name", None)
        members.append(member_copy)
    safe["members"] = members

    address = dict(safe.get("address", {}) or {})
    for key in ("houseNumber", "buildingName", "street"):
        address.pop(key, None)
    safe["address"] = address
    safe.pop("location", None)

    return safe


async def _chat(settings: Settings, system: str, user: str) -> str:
    if not settings.ai_enabled:
        raise AiUnavailable("AI is not configured on this server")

    try:
        import httpx
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise AiUnavailable(
            "The 'httpx' package is required for AI features. "
            "Run: pip install -r requirements-optional.txt"
        ) from exc

    url = f"{(settings.ai_base_url or '').rstrip('/')}/chat/completions"

    try:
        async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {settings.ai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.ai_model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "temperature": 0,
                },
            )
    except Exception as error:
        raise AiUnavailable(f"Could not reach the AI provider: {error}") from error

    if response.status_code >= 400:
        raise AiUnavailable(f"AI provider returned {response.status_code}: {response.text[:200]}")

    try:
        data = response.json()
        return str(data["choices"][0]["message"]["content"])
    except (KeyError, IndexError, ValueError) as error:
        raise AiUnavailable("AI provider returned an unexpected response") from error


def _extract_json(text: str) -> Any:
    """Pull a JSON object out of a reply that may be fenced or prefixed."""
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:]
        stripped = stripped.strip()

    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(stripped[start : end + 1])
            except json.JSONDecodeError:
                pass
    raise AiUnavailable("AI provider did not return valid JSON")


async def validate_household(settings: Settings, household: dict[str, Any]) -> list[dict[str, Any]]:
    payload = json.dumps(redact(household), ensure_ascii=False)
    reply = await _chat(settings, SYSTEM_PROMPT, payload)
    parsed = _extract_json(reply)

    raw_issues = parsed.get("issues") if isinstance(parsed, dict) else None
    if not isinstance(raw_issues, list):
        return []

    issues: list[dict[str, Any]] = []
    for item in raw_issues[:20]:
        if not isinstance(item, dict):
            continue
        message = str(item.get("message", "")).strip()
        if not message:
            continue
        severity = item.get("severity")
        issues.append(
            {
                "memberId": item.get("memberId") if isinstance(item.get("memberId"), str) else None,
                "field": item.get("field") if isinstance(item.get("field"), str) else None,
                "severity": severity if severity in ("error", "warning", "info") else "warning",
                "message": message[:280],
            }
        )
    return issues


async def translate(settings: Settings, text: str, target_language: str) -> tuple[str, str]:
    language = LANGUAGE_NAMES.get(target_language, target_language)
    reply = await _chat(settings, TRANSLATE_PROMPT.format(language=language), text)
    return reply.strip(), settings.ai_model
