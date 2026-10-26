from typing import Annotated
from fastapi import APIRouter, Depends

from auth.deps import EngineContext, require_any_permission, require_permission
from costume_score.schemas import *
import costume_score.service as costume_score_service

router = APIRouter(prefix="/costume", tags=["Jelmezpontozás"])

type CostomeScoreContext = Annotated[EngineContext, Depends(require_permission("costume.score"))]
type CostumeRemoveContext = Annotated[EngineContext, Depends(require_any_permission("costume.edit", "costume.score"))]
type CostumeEditContext = Annotated[EngineContext, Depends(require_any_permission("costume.edit", "costume.score"))]

@router.get("", response_model=list[ScoreResponse])
async def get_all_scores(
    ctx: CostomeScoreContext,
):
    return await costume_score_service.get_scores(ctx)

@router.post("", response_model=ScoreResponse)
async def score(
    data: ScoreCostume,
    ctx: CostomeScoreContext,
):
    return await costume_score_service.score(data, ctx)


@router.put(
    "/{score_id}/remove",
    response_model=ScoreResponse,
)
async def remove_score(
    score_id: int,
    data: RemoveScore,
    ctx: CostumeRemoveContext,
):
    return await costume_score_service.remove_score(score_id, data, ctx)

@router.put(
    "/{score_id}/edit",
    response_model=ScoreResponse,
)
async def edit_score(
    score_id: int,
    data: ScoreCostume,
    ctx: CostumeEditContext,
):
    return await costume_score_service.edit_score(score_id, data, ctx)