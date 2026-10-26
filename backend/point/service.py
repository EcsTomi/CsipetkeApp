from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select, func, case, and_
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from audit_log.service import log_audit
from auth.deps import EngineContext, check_for_any_permission
from event_settings.service import _get_settings
from models.point import Point, PointSource
from models.task import ScoringType, Task
from models.user import User
from point.schemas import BulkPlacementCorrection, CreatePoint, RemovePoint, PointResponse

from websocket.manager import websocket_manager
import point.websocket as point_websocket

async def _is_point_hidden(ctx: EngineContext, point: Point) -> bool:
    from point.service import _get_settings
    settings = await _get_settings(ctx)
    frozen_at = settings.points_frozen_at

    visible_from = point.visible_from
    if visible_from is None:
        return bool(frozen_at)
    if visible_from.tzinfo is None:
        visible_from = visible_from.replace(tzinfo=ZoneInfo("Europe/Budapest"))

    return (visible_from > datetime.now(ZoneInfo("Europe/Budapest"))) or bool(frozen_at)


async def create_point(
    data: CreatePoint, ctx: EngineContext
) -> Point:
    point = Point(
        class_letter=data.class_letter,
        amount=data.amount,
        task_id=data.task_id,
        details=data.details,
        created_at=datetime.now(ZoneInfo("Europe/Budapest")),
        created_by_id=ctx.user.id,
        visible_from=data.visible_from or datetime.now(ZoneInfo("Europe/Budapest")),
    )
    ctx.db.add(point)
    await ctx.db.commit()
    await ctx.db.refresh(point, attribute_names=["created_by", "task"])
    await ctx.db.refresh(point.created_by, attribute_names=["role"])
    await log_audit(ctx, "point.create", target_id=point.id, target_name=point.task.name if point.task else point.details, return_code=status.HTTP_201_CREATED, meta={"amount": point.amount, "class": point.class_letter})
    await websocket_manager.broadcast(
        "point.create",
        PointResponse.model_validate(point).model_dump(mode="json"),
        require_all_permissions=["point.hidden", "point.other_class", "point.details"] if await _is_point_hidden(ctx, point) else ["point.other_class", "point.details"],
        exclude_user_id=ctx.user.id, # Saját magának nem küldjük vissza
    )
    await websocket_manager.broadcast(
        "point.create",
        PointResponse.model_validate(point).model_dump(mode="json"),
        require_all_permissions=["point.hidden", "point.details"] if await _is_point_hidden(ctx, point) else ["point.details"],
        require_no_permissions=["point.other_class"],
        class_letter=point.class_letter,
        exclude_user_id=ctx.user.id, # Saját magának nem küldjük vissza
    )
    await point_websocket.send_summary(ctx, websocket_manager)
    return point


async def remove_point(
    point_id: int, data: RemovePoint, ctx: EngineContext
) -> Point:
    point = await ctx.db.get(Point, point_id)
    if point is None:
        await log_audit(ctx, "point.remove", target_id=point_id, return_code=status.HTTP_404_NOT_FOUND, meta={"message": "A pont nem található"})
        raise HTTPException(404, "A pont nem található")
    if point.created_by_id != ctx.user.id and not await check_for_any_permission(ctx, "point.remove"):
        await log_audit(ctx, "point.remove", target_id=point_id, return_code=status.HTTP_403_FORBIDDEN, meta={"message": "Csak a saját pontodat vonhatod vissza!"})
        raise HTTPException(403, "Csak a saját pontodat vonhatod vissza!")
    if not point.is_removed:
        point.is_removed = True
        point.remove_details = data.remove_details
        point.removed_at = datetime.now(ZoneInfo("Europe/Budapest"))
        point.removed_by_id = ctx.user.id
        await ctx.db.commit()

    await ctx.db.refresh(point, attribute_names=["created_by", "removed_by", "task"])
    if point.created_by_id is not None:
        await ctx.db.refresh(point.created_by, attribute_names=["role"])
    if point.removed_by_id is not None:
        await ctx.db.refresh(point.removed_by, attribute_names=["role"])
    await log_audit(ctx, "point.remove", target_id=point.id, target_name=point.task.name if point.task else point.details, return_code=status.HTTP_200_OK, meta={"details": data.remove_details})

    await websocket_manager.broadcast(
        "point.remove",
        {"id": point_id},
        require_no_permissions=["point.hidden"],
        exclude_user_id=ctx.user.id, # Saját magának nem küldjük vissza
    )
    await websocket_manager.broadcast(
        "point.update",
        PointResponse.model_validate(point).model_dump(mode="json"),
        require_all_permissions=["point.hidden"],
        exclude_user_id=ctx.user.id, # Saját magának nem küldjük vissza
    )
    await point_websocket.send_summary(ctx, websocket_manager)

    return point


async def get_points(
    ctx: EngineContext,
    task_id: int | None = None,
) -> list[Point]:
    stmt = select(Point).options(
        selectinload(Point.created_by).selectinload(User.role), selectinload(Point.removed_by).selectinload(User.role), selectinload(Point.task),
        selectinload(Point.modified_by),
    )

    if not await check_for_any_permission(ctx, "point.other_class"):
        stmt = stmt.where(Point.class_letter == ctx.user.class_letter)
    if task_id is not None:
        stmt = stmt.where(Point.task_id == task_id)

    if not await check_for_any_permission(ctx, "point.hidden"):
        stmt = stmt.where(
            Point.is_removed.is_(False), Point.visible_from <= datetime.now(ZoneInfo("Europe/Budapest"))
        )

    freeze_cutoff = await _get_freeze_cutoff(ctx)
    if freeze_cutoff is not None:
        stmt = stmt.where(Point.created_at <= freeze_cutoff)

    stmt = stmt.order_by(Point.created_at.desc())
    result = await ctx.db.execute(stmt)
    points : list[Point] = list(result.scalars().all())

    return points

async def _get_freeze_cutoff(ctx: EngineContext) -> datetime | None:
    settings = await _get_settings(ctx)
    if settings.points_frozen_at is None:
        return None
    if await check_for_any_permission(ctx, "point.hidden"):
        return None
    return settings.points_frozen_at

async def summary(ctx: EngineContext):
    can_see_hidden = await check_for_any_permission(ctx, "point.hidden")
    settings = await _get_settings(ctx)
    freeze_cutoff = settings.points_frozen_at
    visible_cond = Point.visible_from <= datetime.now(ZoneInfo("Europe/Budapest"))
    if freeze_cutoff is not None:
        visible_cond = and_(visible_cond, Point.created_at <= freeze_cutoff)

    public_query = func.sum(case((and_(Point.is_removed.is_(False), visible_cond), Point.amount), else_=0)).label("public_amount")
    columns = [Point.class_letter, public_query]

    if can_see_hidden:
        hidden_cond = Point.visible_from > datetime.now(ZoneInfo("Europe/Budapest"))
        if freeze_cutoff is not None:
            hidden_cond = or_(hidden_cond, Point.created_at >= freeze_cutoff)
        hidden_query = func.sum(case((and_(Point.is_removed.is_(False), hidden_cond), Point.amount), else_=0)).label("hidden_amount")
        columns.append(hidden_query)

    stmt = select(*columns).group_by(Point.class_letter)
    result = await ctx.db.execute(stmt)
    summary = {row.class_letter: row for row in result}

    final = []
    for class_letter in ["a", "b", "c", "d"]:
        sor = summary.get(class_letter)
        final.append(
            {
                "class_letter": class_letter,
                "public_amount": sor.public_amount if sor else 0,
                "hidden_amount": (
                    (sor.hidden_amount if sor else 0) if can_see_hidden else None
                ),
            }
        )
    return final

async def correct_placements(
    data: BulkPlacementCorrection, ctx: EngineContext
) -> list[Point]:
    from juror_score.service import _assert_window_open
    await _assert_window_open(ctx)
    
    task = await ctx.db.get(Task, data.task_id)
    if task is None:
        await log_audit(ctx, "point.correct_placements", target_id=data.task_id, return_code=status.HTTP_404_NOT_FOUND, meta={"message": "A feladat nem található"})
        raise HTTPException(404, "A feladat nem található")
    if task.scoring_type != ScoringType.organizer:
        await log_audit(ctx, "point.correct_placements", target_id=data.task_id, target_name=task.name, return_code=status.HTTP_409_CONFLICT, meta={"message": "Ehhez a feladathoz nem szervezői helyezés-pontozás tartozik"})
        raise HTTPException(409, "Ehhez a feladathoz nem szervezői helyezés-pontozás tartozik")
    if not task.placement_points:
        await log_audit(ctx, "point.correct_placements", target_id=data.task_id, target_name=task.name, return_code=status.HTTP_409_CONFLICT, meta={"message": "Nincs beállítva ponttáblázat ehhez a feladathoz"})
        raise HTTPException(409, "Nincs beállítva ponttáblázat ehhez a feladathoz")

    now = datetime.now(ZoneInfo("Europe/Budapest"))
    results : list[Point] = []

    for entry in data.entries:
        if entry.placement not in task.placement_points:
            await log_audit(ctx, "point.correct_placements", target_id=data.task_id, target_name=task.name, return_code=status.HTTP_400_BAD_REQUEST, meta={"message": f"Érvénytelen helyezés: {entry.placement}"})
            raise HTTPException(400, f"Érvénytelen helyezés: {entry.placement}")
        amount = task.placement_points[entry.placement]

        stmt = select(Point).where(
            Point.task_id == data.task_id,
            Point.class_letter == entry.class_letter,
            Point.is_removed.is_(False),
            Point.source == PointSource.organizer,
        ).order_by(Point.created_at.desc())

        result = await ctx.db.execute(stmt)
        all_points = list(result.scalars().all())

        # Defenzív takarítás: ha valamiért több aktív organizer Point is létezik ugyanahhoz
        # a task_id + class_letter kombinációhoz (nem szabadna), a legrégebbi(eke)t
        # eltávolítjuk (soft-remove), csak a legfrissebbet tartjuk meg és frissítjük
        point = all_points[0] if all_points else None
        if len(all_points) > 1:
            for stale in all_points[1:]:
                stale.is_removed = True
                stale.remove_details = "Automatikus takarítás: duplikált aktív pont"
                stale.removed_at = now
                stale.removed_by_id = ctx.user.id

        if point:
            point.amount = amount
            point.modified_at = now
            point.created_by_id = ctx.user.id
            point.details = f"Helyezés: {entry.placement}."
            await websocket_manager.broadcast(
                "point.update",
                PointResponse.model_validate(point).model_dump(mode="json"),
                require_all_permissions=["point.hidden"] if await _is_point_hidden(ctx, point) else None,
            )
        else:
            point = Point(
                class_letter=entry.class_letter,
                amount=amount,
                task_id=data.task_id,
                created_by_id=ctx.user.id,
                source=PointSource.organizer,
                details=f"Helyezés: {entry.placement}.",
            )
            ctx.db.add(point)
            await ctx.db.commit()
            await ctx.db.refresh(point, attribute_names=["created_by"])
            await ctx.db.refresh(point.created_by, attribute_names=["role"])
            await websocket_manager.broadcast(
                "point.create",
                PointResponse.model_validate(point).model_dump(mode="json"),
                require_all_permissions=["point.hidden", "point.other_class", "point.details"] if await _is_point_hidden(ctx, point) else ["point.other_class", "point.details"],
            )
            await websocket_manager.broadcast(
                "point.create",
                PointResponse.model_validate(point).model_dump(mode="json"),
                require_all_permissions=["point.hidden", "point.details"] if await _is_point_hidden(ctx, point) else ["point.details"],
                require_no_permissions=["point.other_class"],
                class_letter=point.class_letter,
            )

        results.append(point)

    await ctx.db.commit()
    for point in results:
        await ctx.db.refresh(point, attribute_names=["created_by", "modified_by"])
        if point.created_by_id is not None:
            await ctx.db.refresh(point.created_by, attribute_names=["role"])
        if point.modified_by_id is not None:
            await ctx.db.refresh(point.modified_by, attribute_names=["role"])
    await log_audit(ctx, "point.correct_placements", target_id=data.task_id, target_name=task.name, return_code=status.HTTP_200_OK, meta={"placements": (e.class_letter + ' ' + e.placement) for e in data.entries})
    await point_websocket.send_summary(ctx, websocket_manager)
    return results