from typing import Annotated
from fastapi import APIRouter, Depends

from auth.deps import EngineContext, require_any_permission, require_permission
from point.schemas import (
    BulkPlacementCorrection,
    CreatePoint,
    RemovePoint,
    PointResponse,
    SummaryResponse,
)
import point.service as pont_service

router = APIRouter(prefix="/point", tags=["Pontok"])

type PointGetDetailsContext = Annotated[EngineContext, Depends(require_permission("point.details"))]
type PointGetSummaryContext = Annotated[EngineContext, Depends(require_permission("point.summary"))]
type PointCreateContext = Annotated[EngineContext, Depends(require_any_permission("point.create", "point.costume_score"))]
type PointRemoveContext = Annotated[EngineContext, Depends(require_any_permission("point.remove", "point.create"))]
type PointOnSiteContext = Annotated[EngineContext, Depends(require_permission("point.onsite"))]

@router.get("", response_model=list[PointResponse])
async def get_all_points(
    ctx: PointGetDetailsContext,
):
    return await pont_service.get_points(ctx, None)

@router.post("", response_model=PointResponse)
async def create_point(
    data: CreatePoint,
    ctx: PointCreateContext,
):
    return await pont_service.create_point(data, ctx)


@router.put(
    "/{point_id}/remove",
    response_model=PointResponse,
)
async def remove_point(
    point_id: int,
    data: RemovePoint,
    ctx: PointRemoveContext,
):
    return await pont_service.remove_point(point_id, data, ctx)


@router.get("/summary", response_model=list[SummaryResponse])
async def summary(
    ctx: PointGetSummaryContext,
):
    return await pont_service.summary(ctx)

@router.put(
    "/correct",
    response_model=list[PointResponse],
)
async def correct_placements(
    data: BulkPlacementCorrection,
    ctx: PointOnSiteContext,
):
    return await pont_service.correct_placements(data, ctx)