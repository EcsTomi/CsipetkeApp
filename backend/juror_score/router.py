from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from datetime import datetime

from auth.deps import require_any_permission, require_permission, EngineContext
from juror_score.schemas import JurorScoreUpsert, JurorScoreResponse, JuryWindowResponse
import juror_score.service as juror_score_service

router = APIRouter(prefix="/jury", tags=["Zsűri"])

type JuryContext = Annotated[EngineContext, Depends(require_permission("jury.score"))]
type JuryOrOrganizerContext = Annotated[EngineContext, Depends(require_any_permission("jury.score", "point.onsite"))]

@router.get("/score", response_model=list[JurorScoreResponse])
async def get_my_scores(
    ctx: JuryContext,
):
    return await juror_score_service.get_my_scores(ctx)


@router.put("/score", response_model=JurorScoreResponse)
async def upsert_score(
    data: JurorScoreUpsert, 
    ctx: JuryContext,
):
    return await juror_score_service.upsert_score(ctx, data)


@router.get("/window", response_model=JuryWindowResponse)
async def get_window(
    ctx: JuryOrOrganizerContext,
):
    settings = await juror_score_service.get_jury_window(ctx)
    now = datetime.now(ZoneInfo("Europe/Budapest"))
    is_open = bool(
        settings.jury_window_start and settings.jury_window_end
        and settings.jury_window_start <= now <= settings.jury_window_end
    )
    return JuryWindowResponse(
        is_open=is_open,
        window_start=settings.jury_window_start,
        window_end=settings.jury_window_end,
    )