from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from auth.deps import EngineContext, require_permission
from audit_log.schemas import AuditLogListResponse
import audit_log.service as audit_service

router = APIRouter(
    prefix="/audit-log",
    tags=["Audit log"]
)

type AuditLogContext = Annotated[EngineContext, Depends(require_permission("audit_log.view"))]

@router.get("", response_model=AuditLogListResponse)
async def get_audit_logs(
    ctx: AuditLogContext,
    action: Annotated[list[str] | None, Query()] = None,
    user_name: str | None = None,
    target_id: int | None = None,
    target_name: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    status: int | None = None,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
):
    """
    Audit napló lekérdezése — csak szervezőknek. Csak olvasás,
    módosítás/törlés nincs (az audit log write-once).
    """
    items, total = await audit_service.get_audit_logs(
        ctx,
        action=action,
        user_name=user_name,
        target_id=target_id,
        target_name=target_name,
        date_from=date_from,
        date_to=date_to,
        status=status,
        limit=limit,
        offset=offset,
    )
    return AuditLogListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/actions", response_model=list[str])
async def get_actions(
    ctx: AuditLogContext
):
    """Előforduló action típusok, szűrő legördülőhöz."""
    return await audit_service.get_distinct_actions(ctx)