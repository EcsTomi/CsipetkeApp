from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select, func
from fastapi import HTTPException, status

from audit_log.service import log_audit
from auth.deps import EngineContext
from models.juror_score import JurorScore
from models.point import Point
from models.event_settings import EventSettings
from models.task import ScoringType, Task
from juror_score.schemas import JurorScoreUpsert
from point.schemas import PointResponse
from program_item.service import _get_settings
from point import point_websocket
from websocket.manager import websocket_manager

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy import text

async def _assert_window_open(ctx: EngineContext) -> None:
    settings = await _get_settings(ctx)
    now = datetime.now(ZoneInfo("Europe/Budapest"))
    if settings.jury_window_start is None or settings.jury_window_end is None:
        raise HTTPException(409, "A zsűrizési időablak nincs beállítva")
    if not (settings.jury_window_start <= now <= settings.jury_window_end):
        raise HTTPException(409, "A zsűrizési időablakon kívül vagyunk")


async def get_my_scores(ctx: EngineContext) -> list[JurorScore]:
    stmt = select(JurorScore).where(JurorScore.juror_id == ctx.user.id)
    result = await ctx.db.execute(stmt)
    return list(result.scalars().all())


async def upsert_score(ctx: EngineContext, data: JurorScoreUpsert) -> JurorScore:
    await _assert_window_open(ctx)

    from models.program_item import ProgramItem

    item = await ctx.db.get(ProgramItem, data.program_item_id)
    if item is None or item.task_id is None:
        await log_audit(ctx, "jury_score.upsert", target_id=data.program_item_id, return_code=status.HTTP_404_NOT_FOUND, meta={"message": "A programelem nem található"})
        raise HTTPException(404, "A programelem nem található")

    task = await ctx.db.get(Task, item.task_id)
    if task is None or task.scoring_type != ScoringType.jury:
        await log_audit(ctx, "jury_score.upsert", target_id=data.program_item_id, target_name=item.task.name if item.task else None, return_code=status.HTTP_409_CONFLICT, meta={"message": "Ehhez a feladathoz nem zsűris pontozás tartozik"})
        raise HTTPException(409, "Ehhez a produkcióhoz nem zsűris pontozás tartozik")
    if task.max_points is None:
        await log_audit(ctx, "jury_score.upsert", target_id=data.program_item_id, target_name=item.task.name if item.task else None, return_code=status.HTTP_409_CONFLICT, meta={"message": "A feladathoz nincs maximális pontszám beállítva"})
        raise HTTPException(409, "A feladathoz nincs maximális pontszám beállítva")
    if data.score > task.max_points:
        await log_audit(ctx, "jury_score.upsert", target_id=data.program_item_id, target_name=item.task.name if item.task else None, return_code=status.HTTP_400_BAD_REQUEST, meta={"message": f"A pontszám legfeljebb {task.max_points} lehet"})
        raise HTTPException(400, f"A pontszám legfeljebb {task.max_points} lehet")

    stmt = select(JurorScore).where(
        JurorScore.program_item_id == data.program_item_id,
        JurorScore.juror_id == ctx.user.id,
    )
    result = await ctx.db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.score = data.score
    else:
        existing = JurorScore(program_item_id=data.program_item_id, juror_id=ctx.user.id, score=data.score)
        ctx.db.add(existing)

    await ctx.db.commit()
    await ctx.db.refresh(existing)
    await _recalculate_point(ctx, data.program_item_id)
    return existing


async def _recalculate_point(ctx: EngineContext, program_item_id: int) -> None:
    from models.program_item import ProgramItem
    from models.point import PointSource

    item = await ctx.db.get(ProgramItem, program_item_id)
    if item is None or item.task_id is None or item.class_letter is None:
        return

    scores_stmt = select(JurorScore.score).where(
        JurorScore.program_item_id == program_item_id
    ).where(JurorScore.score > 0)
    scores_result = await ctx.db.execute(scores_stmt)

    #  Eltávolítja a legkisebb és legnagyobb pontszámokat, a többit összeadja,
    #    így kiszűri az esetleges nagyon alacsony vagy nagyon magas pontokat.
    
    scores = list(scores_result.scalars().all())
    scores.sort()
    sum_score = sum(scores)
    if len(scores) >= 3:
        sum_score = sum(scores[1:-1])
    elif len(scores) == 2:
        sum_score = sum(scores[:-1])
    elif len(scores) == 1:
        sum_score = scores[0]
        
    # Átlagolás lenne:
    # sum_score = sum(scores) / len(scores) if len(scores) > 0 else 0

    class_letter = item.class_letter
    task_id = item.task_id

    if len(scores) == 0 or sum_score == 0:
        stmt = select(Point).where(
            Point.task_id == task_id,
            Point.class_letter == class_letter,
            Point.source == PointSource.jury_auto,
            Point.is_removed.is_(False),
        )
        result = await ctx.db.execute(stmt)
        point = result.scalar_one_or_none()
        if point:
            point.is_removed = True
            point.removed_at = datetime.now(ZoneInfo("Europe/Budapest"))
            point.removed_by_id = 0
            await ctx.db.commit()
            await ctx.db.refresh(point, attribute_names=["created_by"])
            await ctx.db.refresh(point.created_by, attribute_names=["role"])

            await websocket_manager.broadcast(
                "point.remove",
                {"id": point.id},
                require_all_permissions=["point.hidden"] if await _is_point_hidden(ctx, point) else None,
            )
        else:
            await ctx.db.commit()
        await point_websocket.send_summary(ctx, websocket_manager)
        return

    rounded = round(sum_score)
    now = datetime.now(ZoneInfo("Europe/Budapest"))

    stmt = pg_insert(Point).values(
        class_letter=class_letter,
        amount=rounded,
        task_id=task_id,
        created_by_id=0,
        source=PointSource.jury_auto,
        visible_from=now,
    ).on_conflict_do_update(
        index_elements=["task_id", "class_letter"],
        index_where=text("source = 'jury_auto' AND is_removed = false"),
        set_={
            "amount": rounded,
            "modified_at": now,
        },
    ).returning(Point)

    result = await ctx.db.execute(stmt)
    point = result.scalar_one()
    await ctx.db.commit()
    await ctx.db.refresh(point, attribute_names=["created_by"])
    await ctx.db.refresh(point.created_by, attribute_names=["role"])

    await websocket_manager.broadcast(
        "point.upsert",
        PointResponse.model_validate(point).model_dump(mode="json"),
        require_all_permissions=["point.hidden", "point.other_class", "point.details"] if await _is_point_hidden(ctx, point) else ["point.other_class", "point.details"],
    )
    await websocket_manager.broadcast(
        "point.upsert",
        PointResponse.model_validate(point).model_dump(mode="json"),
        require_all_permissions=["point.hidden", "point.details"] if await _is_point_hidden(ctx, point) else ["point.details"],
        class_letter=point.class_letter,
    )

    await point_websocket.send_summary(ctx, websocket_manager)


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


async def get_jury_window(ctx: EngineContext) -> EventSettings:
    return await _get_settings(ctx)