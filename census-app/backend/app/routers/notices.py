"""Field notices — the one channel that reaches all three roles.

An administrator posts once ("Zone WB-04 reopens Monday", "Record ages in
completed years, not birth years") and it appears on the home screen of every
enumerator and supervisor it is addressed to. Notices ride along with the sync,
so one posted while a team is in the field still shows up the next time their
phones come back online.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..deps import CurrentUser, RequireAdmin, get_store, record_audit
from ..models import NoticeIn, NoticeOut, now_iso
from ..store import Store

router = APIRouter(prefix="/api/notices", tags=["notices"])


def visible_to(notice: dict[str, Any], role: str) -> bool:
    """Active notices addressed to everyone, or to this role specifically."""
    if not notice.get("active", True):
        return False
    audience = notice.get("audience", "all")
    if audience == "all":
        return True
    if role == "admin":
        return True  # administrators see everything they publish
    return audience == role


LEVEL_ORDER = {"urgent": 0, "important": 1, "info": 2}


def sort_notices(notices: list[dict[str, Any]]) -> None:
    """Urgent first, newest first within a level. Sorts in place.

    Two passes rather than one composite key: Python's sort is stable, so
    ordering by date and then by level gives exactly that, and reads far better
    than trying to express a descending string inside a single key.
    """
    notices.sort(key=lambda notice: notice.get("createdAt", ""), reverse=True)
    notices.sort(key=lambda notice: LEVEL_ORDER.get(notice.get("level", "info"), 2))


@router.get("")
async def list_notices(
    principal: CurrentUser,
    store: Annotated[Store, Depends(get_store)],
    include_inactive: Annotated[bool, Query(alias="include_inactive")] = False,
) -> dict[str, list[NoticeOut]]:
    rows = await store.find("notices")

    if include_inactive:
        if not principal.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only administrators can see withdrawn notices",
            )
        visible = rows
    else:
        visible = [row for row in rows if visible_to(row, principal.role)]

    sort_notices(visible)
    return {"notices": [NoticeOut.model_validate(row) for row in visible]}


@router.post("", response_model=NoticeOut)
async def create_notice(
    payload: NoticeIn,
    principal: RequireAdmin,
    store: Annotated[Store, Depends(get_store)],
) -> NoticeOut:
    title = (payload.title or "").strip()
    body = (payload.body or "").strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A title is required")
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A message is required")

    record: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "title": title,
        "body": body,
        "audience": payload.audience or "all",
        "level": payload.level or "info",
        "active": True if payload.active is None else payload.active,
        "createdAt": now_iso(),
        "createdBy": principal.id,
        "createdByName": principal.name,
        "updatedAt": None,
    }

    saved = await store.put("notices", record)
    await record_audit(
        store,
        actor_id=principal.id,
        actor_name=principal.name,
        action="notice.create",
        target=title,
        detail=f"audience={record['audience']} level={record['level']}",
    )
    return NoticeOut.model_validate(saved)


@router.patch("/{notice_id}", response_model=NoticeOut)
async def update_notice(
    notice_id: str,
    payload: NoticeIn,
    principal: RequireAdmin,
    store: Annotated[Store, Depends(get_store)],
) -> NoticeOut:
    record = await store.get("notices", notice_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notice not found")

    if payload.title is not None and payload.title.strip():
        record["title"] = payload.title.strip()
    if payload.body is not None and payload.body.strip():
        record["body"] = payload.body.strip()
    if payload.audience is not None:
        record["audience"] = payload.audience
    if payload.level is not None:
        record["level"] = payload.level
    if payload.active is not None:
        record["active"] = payload.active
    record["updatedAt"] = now_iso()

    saved = await store.put("notices", record)
    await record_audit(
        store,
        actor_id=principal.id,
        actor_name=principal.name,
        action="notice.update",
        target=saved.get("title", notice_id),
        detail="withdrawn" if saved.get("active") is False else "published",
    )
    return NoticeOut.model_validate(saved)


@router.delete("/{notice_id}")
async def delete_notice(
    notice_id: str,
    principal: RequireAdmin,
    store: Annotated[Store, Depends(get_store)],
) -> dict[str, bool]:
    record = await store.get("notices", notice_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notice not found")

    await store.delete("notices", notice_id)
    await record_audit(
        store,
        actor_id=principal.id,
        actor_name=principal.name,
        action="notice.delete",
        target=record.get("title", notice_id),
    )
    return {"ok": True}
