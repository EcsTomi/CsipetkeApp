from datetime import datetime
from zoneinfo import ZoneInfo
from audit_log.service import log_audit
from auth.deps import EngineContext
from models.event_settings import EventSettings
from fastapi import status
from websocket.manager import websocket_manager

async def _get_settings(ctx: EngineContext) -> EventSettings:
    settings = await ctx.db.get(EventSettings, 1)
    if settings is None:
        settings = EventSettings(id=1)
        ctx.db.add(settings)
        await ctx.db.commit()
        await ctx.db.refresh(settings)
    return settings


async def pause_points(ctx: EngineContext) -> EventSettings:
    settings = await _get_settings(ctx)
    if settings.points_frozen_at is None:
        settings.points_frozen_at = datetime.now(ZoneInfo("Europe/Budapest"))
        await ctx.db.commit()
        await log_audit(ctx, "event_settings.pause_points", target_id=1, return_code=status.HTTP_200_OK, meta={"points_frozen_at": settings.points_frozen_at.isoformat()})
        await websocket_manager.broadcast(
            "event_settings.pause_points",
            {"points_frozen_at": settings.points_frozen_at.isoformat()},
        )
    return settings


async def publish_points(ctx: EngineContext) -> EventSettings:
    settings = await _get_settings(ctx)
    settings.points_frozen_at = None
    await ctx.db.commit()
    await log_audit(ctx, "event_settings.publish_points", target_id=1, return_code=status.HTTP_200_OK, meta={"points_frozen_at": settings.points_frozen_at})
    await websocket_manager.broadcast(
        "event_settings.publish_points",
        {"points_frozen_at": None},
    )
    return settings

async def set_jury_window(ctx: EngineContext, start: datetime, end: datetime) -> EventSettings:
    settings = await _get_settings(ctx)
    settings.jury_window_start = start
    settings.jury_window_end = end
    await ctx.db.commit()
    await log_audit(ctx, "event_settings.set_jury_window", target_id=1, return_code=status.HTTP_200_OK, meta={"jury_window_start": settings.jury_window_start.isoformat(), "jury_window_end": settings.jury_window_end.isoformat()})
    await websocket_manager.broadcast(
        "event_settings.set_jury_window",
        {
            "is_open": bool(settings.jury_window_start and settings.jury_window_end and settings.jury_window_start <= datetime.now(ZoneInfo("Europe/Budapest")) <= settings.jury_window_end),
            "jury_window_start": settings.jury_window_start.isoformat() if settings.jury_window_start else None,
            "jury_window_end": settings.jury_window_end.isoformat() if settings.jury_window_end else None,
        },
    )
    return settings

async def set_winner(ctx: EngineContext, class_letter: str | None) -> EventSettings:
    settings = await _get_settings(ctx)
    settings.winning_class = class_letter
    await ctx.db.commit()
    await log_audit(ctx, "event_settings.set_winner", target_id=1, return_code=status.HTTP_200_OK, meta={"winner": settings.winning_class})
    await websocket_manager.broadcast(
        "event_settings.set_winner",
        {"winner": settings.winning_class},
    )
    return settings