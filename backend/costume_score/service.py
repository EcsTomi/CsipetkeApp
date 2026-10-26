from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select, func, case, and_
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from audit_log.service import log_audit
from auth.deps import EngineContext, check_for_any_permission
from event_settings.service import _get_settings
from models.costume_score import CostumeScore
from models.point import Point, PointSource
from models.task import ScoringType, Task
from models.user import User
from costume_score.schemas import *

from websocket.manager import websocket_manager

async def get_scores(
    ctx: EngineContext,
) -> list[CostumeScore]:
    stmt = select(CostumeScore).options(
        selectinload(CostumeScore.created_by).selectinload(User.role), selectinload(CostumeScore.removed_by).selectinload(User.role),
        selectinload(CostumeScore.modified_by).selectinload(User.role),
    )

    stmt = stmt.order_by(CostumeScore.created_at.desc())
    result = await ctx.db.execute(stmt)
    points : list[CostumeScore] = list(result.scalars().all())
    points_new = []
    if(not await check_for_any_permission(ctx, "costume.total")):
        for point in points:
            point2 = ScoreResponse.model_validate(point).model_dump()
            if point2["created_by"]["id"] == ctx.user.id:
                points_new.append(point2)
            else:
                point2["calculatedSum"] = 0
                points_new.append(point2)
        points = points_new
    return points


async def score(
    data: ScoreCostume, ctx: EngineContext
) -> CostumeScore:
    costumeScore = CostumeScore(
        class_letter=data.class_letter.lower(),
        headcount=data.headcount,
        notDressed=data.notDressed,
        extraItems=data.extraItems,
        ofDressed=data.ofDressed,
        note=data.note,
        created_at=datetime.now(ZoneInfo("Europe/Budapest")),
        created_by_id=ctx.user.id,
    )
    ctx.db.add(costumeScore)
    await ctx.db.commit()
    await ctx.db.refresh(costumeScore, attribute_names=["created_by"])
    await ctx.db.refresh(costumeScore.created_by, attribute_names=["role"])
    await log_audit(ctx, "costume.score", target_id=costumeScore.id, target_name=costumeScore.class_letter, return_code=status.HTTP_201_CREATED, meta={"headcount": costumeScore.headcount, "notDressed": costumeScore.notDressed, "extraItems": costumeScore.extraItems, "ofDressed": costumeScore.ofDressed, "note": costumeScore.note})
    await websocket_manager.broadcast(
        "costume.score",
        ScoreResponse.model_validate(costumeScore).model_dump(mode="json"),
        require_all_permissions=["costume.score"],
        exclude_user_id=ctx.user.id, # Saját magának nem küldjük vissza
    )
    return costumeScore


async def remove_score(
    score_id: int, data: RemoveScore, ctx: EngineContext
) -> CostumeScore:
    costumeScore = await ctx.db.get(CostumeScore, score_id)
    if costumeScore is None:
        await log_audit(ctx, "costume.remove", target_id=score_id, return_code=status.HTTP_404_NOT_FOUND, meta={"message": "A jelmezpontozás nem található"})
        raise HTTPException(404, "A jelmezpontozás nem található")
    if costumeScore.created_by_id != ctx.user.id and not await check_for_any_permission(ctx, "costume.edit"):
        await log_audit(ctx, "costume.remove", target_id=score_id, return_code=status.HTTP_403_FORBIDDEN, meta={"message": "Csak a saját jelmezpontozásodat vonhatod vissza!"})
        raise HTTPException(403, "Csak a saját jelmezpontozásodat vonhatod vissza!")
    if not costumeScore.is_removed:
        costumeScore.is_removed = True
        costumeScore.remove_details = data.remove_details
        costumeScore.removed_at = datetime.now(ZoneInfo("Europe/Budapest"))
        costumeScore.removed_by_id = ctx.user.id
        await ctx.db.commit()

    await ctx.db.refresh(costumeScore, attribute_names=["created_by", "removed_by"])
    if costumeScore.created_by_id is not None:
        await ctx.db.refresh(costumeScore.created_by, attribute_names=["role"])
    if costumeScore.removed_by_id is not None:
        await ctx.db.refresh(costumeScore.removed_by, attribute_names=["role"])
    await log_audit(ctx, "costume.remove", target_id=costumeScore.id, target_name=costumeScore.class_letter, return_code=status.HTTP_200_OK, meta={"details": data.remove_details})

    await websocket_manager.broadcast(
        "costume.update",
        ScoreResponse.model_validate(costumeScore).model_dump(mode="json"),
        require_all_permissions=["costume.score"],
        exclude_user_id=ctx.user.id, # Saját magának nem küldjük vissza
    )

    return costumeScore


async def edit_score(
    score_id: int, data: ScoreCostume, ctx: EngineContext
) -> CostumeScore:
    costumeScore = await ctx.db.get(CostumeScore, score_id)
    if costumeScore is None:
        await log_audit(ctx, "costume.edit", target_id=score_id, return_code=status.HTTP_404_NOT_FOUND, meta={"message": "A jelmezpontozás nem található"})
        raise HTTPException(404, "A jelmezpontozás nem található")
    if costumeScore.created_by_id != ctx.user.id and not await check_for_any_permission(ctx, "costume.edit"):
        await log_audit(ctx, "costume.edit", target_id=score_id, return_code=status.HTTP_403_FORBIDDEN, meta={"message": "Csak a saját jelmezpontozásodat szerkesztheted!"})
        raise HTTPException(403, "Csak a saját jelmezpontozásodat szerkesztheted!")
    costumeScore.class_letter = data.class_letter.lower()
    costumeScore.headcount = data.headcount
    costumeScore.notDressed = data.notDressed
    costumeScore.extraItems = data.extraItems
    costumeScore.ofDressed = data.ofDressed
    costumeScore.note = data.note
    costumeScore.modified_at = datetime.now(ZoneInfo("Europe/Budapest"))
    costumeScore.modified_by_id = ctx.user.id
    await ctx.db.commit()

    await ctx.db.refresh(costumeScore, attribute_names=["created_by", "modified_by"])
    if costumeScore.created_by_id is not None:
        await ctx.db.refresh(costumeScore.created_by, attribute_names=["role"])
    if costumeScore.modified_by_id is not None: 
        await ctx.db.refresh(costumeScore.modified_by, attribute_names=["role"])
    await log_audit(ctx, "costume.edit", target_id=costumeScore.id, target_name=costumeScore.class_letter, return_code=status.HTTP_200_OK, meta={"headcount": costumeScore.headcount, "notDressed": costumeScore.notDressed, "extraItems": costumeScore.extraItems, "ofDressed": costumeScore.ofDressed, "note": costumeScore.note})

    await websocket_manager.broadcast(
        "costume.update",
        ScoreResponse.model_validate(costumeScore).model_dump(mode="json"),
        require_all_permissions=["costume.score"],
        exclude_user_id=ctx.user.id, # Saját magának nem küldjük vissza
    )

    return costumeScore