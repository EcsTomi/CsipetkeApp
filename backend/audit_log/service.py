from datetime import datetime
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from audit_log.schemas import AuditLogResponse
from auth.deps import EngineContext
from models.audit_log import AuditLog
from models.user import User
from utils.text import normalize_text

from websocket import websocket_manager

async def log_audit(
    ctx: EngineContext,
    action: str,
    target_id: int | None = None,
    target_name: str | None = None,
    return_code: int | None = None,
    meta: dict[str, Any] | None = None,
) -> AuditLog:
    """
    Audit esemény rögzítése.
    """
    entry = AuditLog(
        action=action,
        user_id=ctx.user.id,
        target_id=target_id,
        target_name=normalize_text(target_name)[:300] if target_name is not None else None,
        return_code=return_code,
        meta=meta,
    )
    ctx.db.add(entry)
    await ctx.db.commit()
    await ctx.db.refresh(entry, attribute_names=["user"])
    await ctx.db.refresh(entry.user, attribute_names=["role"])
    await websocket_manager.broadcast("audit_log.log", AuditLogResponse.model_validate(entry).model_dump(mode="json"), require_all_permissions=["audit_log.view"])
    return entry


async def get_audit_logs(
    ctx: EngineContext,
    action: list[str] | None = None,
    user_name: str | None = None,
    target_id: int | None = None,
    target_name: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    status: int | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[AuditLog], int]:
    stmt = select(AuditLog).options(selectinload(AuditLog.user).selectinload(User.role))
    count_stmt = select(func.count()).select_from(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action.in_(action))
        count_stmt = count_stmt.where(AuditLog.action.in_(action))
    else:
        stmt = stmt.where(AuditLog.action != "user.login")
        count_stmt = count_stmt.where(AuditLog.action != "user.login")
    if user_name is not None:
        pattern = f"%{user_name}%"
        stmt = stmt.join(AuditLog.user).where(AuditLog.user_name.ilike(pattern))
        count_stmt = count_stmt.join(AuditLog.user).where(AuditLog.user_name.ilike(pattern))
    if target_id is not None:
        stmt = stmt.where(AuditLog.target_id == target_id)
        count_stmt = count_stmt.where(AuditLog.target_id == target_id)
    if target_name:
        pattern = f"%{normalize_text(target_name)}%"
        stmt = stmt.where(AuditLog.target_name.ilike(pattern))
        count_stmt = count_stmt.where(AuditLog.target_name.ilike(pattern))
    if date_from is not None:
        stmt = stmt.where(AuditLog.created_at >= date_from)
        count_stmt = count_stmt.where(AuditLog.created_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(AuditLog.created_at <= date_to)
        count_stmt = count_stmt.where(AuditLog.created_at <= date_to)
    if status is not None:
        stmt = stmt.where(AuditLog.return_code == status)
        count_stmt = count_stmt.where(AuditLog.return_code == status)

    stmt = stmt.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)

    total = (await ctx.db.execute(count_stmt)).scalar_one()
    result = await ctx.db.execute(stmt)
    return list(result.scalars().all()), total


async def get_distinct_actions(ctx: EngineContext) -> list[str]:
    """A szűrő legördülőhöz: milyen action típusok fordultak elő eddig."""
    stmt = select(AuditLog.action).distinct().order_by(AuditLog.action)
    result = await ctx.db.execute(stmt)
    return list(result.scalars().all())