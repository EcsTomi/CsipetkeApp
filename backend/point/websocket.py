from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select, func, case, and_

from auth.deps import EngineContext
from models.point import Point
from websocket.manager import ConnectionManager

async def send_summary(ctx: EngineContext, websocket_manager: ConnectionManager):
    from point.service import _get_settings
    settings = await _get_settings(ctx)
    freeze_cutoff = settings.points_frozen_at
    visible_cond = Point.visible_from <= datetime.now(ZoneInfo("Europe/Budapest"))
    if freeze_cutoff is not None:
        visible_cond = and_(visible_cond, Point.created_at <= freeze_cutoff)

    public_query = func.sum(case((and_(Point.is_removed.is_(False), visible_cond), Point.amount), else_=0)).label("public_amount")
    columns = [Point.class_letter, public_query]

    hidden_cond = Point.visible_from > datetime.now(ZoneInfo("Europe/Budapest"))
    if freeze_cutoff is not None:
        hidden_cond = or_(hidden_cond, Point.created_at >= freeze_cutoff)
    hidden_query = func.sum(case((and_(Point.is_removed.is_(False), hidden_cond), Point.amount), else_=0)).label("hidden_amount")
    columns.append(hidden_query)

    stmt = select(*columns).group_by(Point.class_letter)
    result = await ctx.db.execute(stmt)
    summary = {row.class_letter: row for row in result}

    final = []
    finalWithOutHidden = []
    for class_letter in ["a", "b", "c", "d"]:
        sor = summary.get(class_letter)
        final.append(
            {
                "class_letter": class_letter,
                "public_amount": sor.public_amount if sor else 0,
                "hidden_amount": sor.hidden_amount if sor else 0,
            }
        )
        finalWithOutHidden.append(
            {
                "class_letter": class_letter,
                "public_amount": sor.public_amount if sor else 0,
                "hidden_amount": 0,
            }
        )
    await websocket_manager.broadcast(
        "point.summary",
        {
            "summaries": finalWithOutHidden,
        },
        require_all_permissions=["point.summary"],
        require_no_permissions=["point.hidden"],
    )
    await websocket_manager.broadcast(
        "point.summary",
        {
            "summaries": final,
        },
        require_all_permissions=["point.hidden", "point.summary"],
    )