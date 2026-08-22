"""Optional AI endpoints. Return 503 with a clear message when not configured."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from .. import ai
from ..config import Settings
from ..deps import CurrentUser, settings_dep
from ..models import AiIssue, AiTranslateIn, AiTranslateOut, AiValidateIn, AiValidateOut

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/validate", response_model=AiValidateOut)
async def validate(
    payload: AiValidateIn,
    _: CurrentUser,
    settings: Annotated[Settings, Depends(settings_dep)],
) -> AiValidateOut:
    try:
        issues = await ai.validate_household(settings, payload.household.model_dump())
    except ai.AiUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)
        ) from error
    return AiValidateOut(issues=[AiIssue.model_validate(issue) for issue in issues])


@router.post("/translate", response_model=AiTranslateOut)
async def translate(
    payload: AiTranslateIn,
    _: CurrentUser,
    settings: Annotated[Settings, Depends(settings_dep)],
) -> AiTranslateOut:
    try:
        text, provider = await ai.translate(settings, payload.text, payload.targetLanguage)
    except ai.AiUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)
        ) from error
    return AiTranslateOut(text=text, provider=provider)
