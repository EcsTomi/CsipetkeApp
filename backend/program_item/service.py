from typing import Optional
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from audit_log.service import log_audit
from auth.deps import EngineContext, check_for_any_permission
from models.program_item import ProgramItem
from models.event_settings import EventSettings
from program_item.schemas import ProgramBreakModify, ProgramItemCreate, ProgramItemReorder, ProgramItemBulkGenerate, ProgramItemResponse

from websocket import websocket_manager

async def _get_settings(ctx: EngineContext) -> EventSettings:
    settings = await ctx.db.get(EventSettings, 1)
    if settings is None:
        settings = EventSettings(id=1)
        ctx.db.add(settings)
        await ctx.db.commit()
        await ctx.db.refresh(settings)
    return settings

async def _remove_details(ctx: EngineContext, item_in: ProgramItem) -> Optional[ProgramItemResponse]:
    if item_in is None:
        return None
    item = ProgramItemResponse.model_validate(item_in)
    if(not await check_for_any_permission(ctx, "program.view_description", "program.manage")):
        item.custom_description = None
        if(item.task):
            item.task.details = None
    if(item.task and item.task.previously_public):
        item.task.details = None # Az előzeteseknél lévő hosszú leírás nem számít.
    return item

async def _remove_all_details(item_in: ProgramItem, remove_details: bool) -> ProgramItemResponse:
    item = ProgramItemResponse.model_validate(item_in)
    if(remove_details):
        item.custom_description = None
        if(item.task):
            item.task.details = None
    if(item.task and item.task.previously_public):
        item.task.details = None
    return item

async def get_all(ctx: EngineContext) -> list[ProgramItem]:
    stmt = (
        select(ProgramItem)
        .options(selectinload(ProgramItem.task))
        .order_by(ProgramItem.order_index)
    )
    result = await ctx.db.execute(stmt)
    return list(result.scalars().all())

async def create(ctx: EngineContext, data: ProgramItemCreate) -> ProgramItem:
    order_index = data.order_index
    if order_index is None:
        max_order = await ctx.db.scalar(select(func.max(ProgramItem.order_index)))
        order_index = (max_order or 0) + 1

    item = ProgramItem(
        task_id=data.task_id,
        class_letter=data.class_letter,
        custom_label=data.custom_label,
        custom_description=data.custom_description,
        order_index=order_index,
    )
    ctx.db.add(item)
    await ctx.db.commit()
    await ctx.db.refresh(item, attribute_names=["task"])
    await log_audit(ctx, "program_item.create", target_id=item.id, target_name=item.task.name if item.task else item.custom_label, return_code=status.HTTP_201_CREATED)
    await websocket_manager.broadcast(
        "program_item.create",
        await _remove_all_details(item, True),
        require_any_permissions=["program.view_all", "jury.score", "point.onsite"],
        require_no_permissions=["program.view_description", "program.manage"],
        exclude_user_id=ctx.user.id
    )
    await websocket_manager.broadcast(
        "program_item.create",
        await _remove_all_details(item, False),
        require_any_permissions=["program.view_description", "program.manage"],
        exclude_user_id=ctx.user.id
    )
    return item

async def modify(ctx: EngineContext, item_id: int, data: ProgramBreakModify) -> ProgramItem:
    item = await ctx.db.get(ProgramItem, item_id)
    if item is None:
        await log_audit(ctx, "program_item.modify", target_id=item_id, return_code=status.HTTP_404_NOT_FOUND, meta={"message": "Nincs ilyen programelem."})
        raise HTTPException(404, "Nincs ilyen programelem.")
    item.custom_label = data.custom_label
    item.custom_description = data.custom_description
    await ctx.db.commit()
    await ctx.db.refresh(item)
    await log_audit(ctx, "program_item.modify", target_id=item.id, target_name=item.custom_label, return_code=status.HTTP_200_OK, meta={"custom_label": item.custom_label, "custom_description": item.custom_description})
    await websocket_manager.broadcast(
        "program_item.modify",
        await _remove_all_details(item, True),
        require_any_permissions=["program.view_all", "jury.score", "point.onsite"],
        require_no_permissions=["program.view_description", "program.manage"],
        exclude_user_id=ctx.user.id
    )
    await websocket_manager.broadcast(
        "program_item.modify",
        await _remove_all_details(item, False),
        require_any_permissions=["program.view_description", "program.manage"],
        exclude_user_id=ctx.user.id
    )
    return item

async def bulk_generate(ctx: EngineContext, data: ProgramItemBulkGenerate) -> list[ProgramItem]:
    from models.task import Task, ScoringType

    max_order = await ctx.db.scalar(select(func.max(ProgramItem.order_index)))
    next_order = (max_order or 0) + 1

    task = await ctx.db.get(Task, data.task_id)
    if task is None:
        await log_audit(ctx, "program_item.bulk_generate", target_id=data.task_id, return_code=status.HTTP_404_NOT_FOUND, meta={"message": "Nincs ilyen feladat."})
        raise HTTPException(404, "Nincs ilyen feladat.")
    if task.scoring_type == ScoringType.none:
        await log_audit(ctx, "program_item.bulk_generate", target_id=data.task_id, target_name=task.name, return_code=status.HTTP_400_BAD_REQUEST, meta={"message": "A feladatnak nincs pontozási módja beállítva a Feladatok fülön."})
        raise HTTPException(400, "A feladatnak nincs pontozási módja beállítva a Feladatok fülön.")

    items = []
    if task.scoring_type == ScoringType.organizer:
        items.append(ProgramItem(task_id=data.task_id, class_letter=None, order_index=next_order))
    else:
        for i, letter in enumerate(['a', 'b', 'c', 'd']):
            items.append(ProgramItem(task_id=data.task_id, class_letter=letter, order_index=next_order + i))

    ctx.db.add_all(items)
    await ctx.db.commit()
    for item in items:
        await ctx.db.refresh(item, attribute_names=["task"])
        await websocket_manager.broadcast(
            "program_item.create",
            await _remove_all_details(item, True),
            require_any_permissions=["program.view_all", "jury.score", "point.onsite"],
            require_no_permissions=["program.view_description", "program.manage"],
            exclude_user_id=ctx.user.id
        )
        await websocket_manager.broadcast(
            "program_item.create",
            await _remove_all_details(item, False),
            require_any_permissions=["program.view_description", "program.manage"],
            exclude_user_id=ctx.user.id
        )

    await log_audit(ctx, "program_item.bulk_generate", target_id=data.task_id, target_name=task.name, return_code=status.HTTP_201_CREATED, meta={"scoring_type": task.scoring_type})
    return items


async def reorder(ctx: EngineContext, data: ProgramItemReorder) -> list[ProgramItem]:
    ids = [e.id for e in data.items]
    stmt = select(ProgramItem).options(selectinload(ProgramItem.task)).where(ProgramItem.id.in_(ids))
    result = await ctx.db.execute(stmt)
    items_by_id = {item.id: item for item in result.scalars().all()}

    if len(items_by_id) != len(ids):
        await log_audit(ctx, "program_item.reorder", target_id=None, return_code=status.HTTP_404_NOT_FOUND, meta={"message": "Egy vagy több elem nem található"})
        raise HTTPException(404, "Egy vagy több elem nem található")

    for entry in data.items:
        items_by_id[entry.id].order_index = entry.order_index

    await ctx.db.commit()
    await log_audit(ctx, "program_item.reorder", target_id=None, return_code=status.HTTP_200_OK)
    await websocket_manager.broadcast(
        "program_item.reorder",
        [await _remove_all_details(item, True) for item in items_by_id.values()],
        require_any_permissions=["program.view_all", "program.manage", "jury.score", "point.onsite"],
        exclude_user_id=ctx.user.id
    )
    return await get_all(ctx)


async def delete(ctx: EngineContext, item_id: int) -> None:
    stmt = select(ProgramItem).where(ProgramItem.id == item_id).options(selectinload(ProgramItem.task))
    res = await ctx.db.execute(stmt)
    item = res.scalars().first()
    if item is None:
        await log_audit(ctx, "program_item.delete", target_id=item_id, return_code=status.HTTP_404_NOT_FOUND, meta={"message": "A programelem nem található"})
        raise HTTPException(404, "A programelem nem található")
    
    old_id = item.id
    await log_audit(ctx, "program_item.delete", target_id=item_id, target_name=item.task.name if item.task else item.custom_label, return_code=status.HTTP_200_OK)
    await ctx.db.delete(item)
    await ctx.db.commit()
    await websocket_manager.broadcast(
        "program_item.delete",
        {"id": old_id},
        require_any_permissions=["program.view_all", "program.manage", "jury.score", "point.onsite"],
        exclude_user_id=ctx.user.id
    )