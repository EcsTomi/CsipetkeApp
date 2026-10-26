from datetime import datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from auth.deps import require_permission, EngineContext, AnyUserContext, AdminContext
from event_settings.schemas import EventSettingsResponse, JuryWindowResponse
import event_settings.service as event_settings_service

router = APIRouter(prefix="/event-settings", tags=["Esemény beállítások"])

type PointsFreezeContext = Annotated[EngineContext, Depends(require_permission("settings.freeze"))]
type ManageJuryWindowContext = Annotated[EngineContext, Depends(require_permission("settings.jury_window"))]

@router.get("", response_model=EventSettingsResponse)
async def get_settings(
    ctx: AnyUserContext,
):
    return await event_settings_service._get_settings(ctx)

@router.put("/jury/window", response_model=JuryWindowResponse)
async def set_window(
    start: datetime,
    end: datetime,
    ctx: ManageJuryWindowContext,
):
    settings = await event_settings_service.set_jury_window(ctx, start, end)
    is_open = bool(settings.jury_window_start and settings.jury_window_end and settings.jury_window_start <= datetime.now(ZoneInfo("Europe/Budapest")) <= settings.jury_window_end)
    return JuryWindowResponse(is_open=is_open, window_start=settings.jury_window_start, window_end=settings.jury_window_end)


@router.post("/points/pause", response_model=EventSettingsResponse)
async def pause_points(
    ctx: PointsFreezeContext,
):
    return await event_settings_service.pause_points(ctx)


@router.post("/points/publish", response_model=EventSettingsResponse)
async def publish_points(
    ctx: PointsFreezeContext,
):
    return await event_settings_service.publish_points(ctx)

@router.post("/winner/none", response_model=EventSettingsResponse)
async def set_winner_none(
    ctx: AdminContext,
):
    return await event_settings_service.set_winner(ctx, None)

@router.post("/winner/{class_letter}", response_model=EventSettingsResponse)
async def set_winner(
    ctx: AdminContext,
    class_letter: str,
):
    return await event_settings_service.set_winner(ctx, class_letter)