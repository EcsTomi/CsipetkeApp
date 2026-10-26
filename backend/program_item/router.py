from typing import Annotated

from fastapi import APIRouter, Depends

from auth.deps import require_any_permission, require_permission, EngineContext
from program_item.schemas import (
    ProgramBreakModify,
    ProgramItemCreate,
    ProgramItemReorder,
    ProgramItemBulkGenerate,
    ProgramItemResponse,
)
import program_item.service as program_item_service

router = APIRouter(prefix="/program-item", tags=["Program"])

type ProgramViewContext = Annotated[EngineContext, Depends(require_any_permission("program.view_all", "program.manage", "jury.score", "point.onsite"))]
type ProgramManageContext = Annotated[EngineContext, Depends(require_permission("program.manage"))]

@router.get("", response_model=list[ProgramItemResponse])
async def get_all(
    ctx: ProgramViewContext,
):
    currentItemList = await program_item_service.get_all(ctx)
    if currentItemList is None:
        return []
    items = [ProgramItemResponse.model_validate(item) for item in currentItemList]
    items_out = [await program_item_service._remove_details(ctx, item) for item in items]
    return items_out


@router.post("", response_model=ProgramItemResponse)
async def create(
    data: ProgramItemCreate, 
    ctx: ProgramManageContext,
):
    return await program_item_service.create(ctx, data)

@router.post("/bulk-generate", response_model=list[ProgramItemResponse])
async def bulk_generate(
    data: ProgramItemBulkGenerate,
    ctx: ProgramManageContext,
):
    return await program_item_service.bulk_generate(ctx, data)


@router.put("/reorder", response_model=list[ProgramItemResponse])
async def reorder(
    data: ProgramItemReorder,
    ctx: ProgramManageContext,
):
    return await program_item_service.reorder(ctx, data)


@router.delete("/{item_id}")
async def delete(
    item_id: int, 
    ctx: ProgramManageContext,
):
    await program_item_service.delete(ctx, item_id)
    return {"ok": True}

@router.put("/{item_id}", response_model=ProgramItemResponse)
async def modify(
    item_id: int, 
    data: ProgramBreakModify, 
    ctx: ProgramManageContext,
):
    return await program_item_service.modify(ctx, item_id, data)