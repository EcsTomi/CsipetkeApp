# versioning/service.py
from datetime import datetime
from typing import Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from auth.deps import EngineContext
from models.version_control import VersionControl

# Melyik mezőket verziózzuk entitástípusonként — ez az egyetlen hely,
# amit bővíteni kell egy új entitás (pl. "vote") bevezetésekor.
VERSIONED_FIELDS = {
    "task": ["name", "details", "visible_from", "available_from", "file_upload", "deadline", "scoring_type", "max_points", "placement_points", "is_deleted"],
}

def make_snapshot(entity, entity_type: str) -> dict:
    fields = VERSIONED_FIELDS[entity_type]
    snap = {}
    for f in fields:
        val = getattr(entity, f)
        snap[f] = val.isoformat() if isinstance(val, datetime) else val
    return snap

async def save_version_if_changed(
    entity_type: str, entity_id: int, snapshot: dict, ctx: EngineContext
) -> Optional[VersionControl]:
    last = await ctx.db.scalar(
        select(VersionControl)
        .where(VersionControl.entity_type == entity_type, VersionControl.entity_id == entity_id)
        .order_by(VersionControl.version_number.desc())
        .limit(1)
    )
    if last and last.data == snapshot:
        return None  # nem tényleges változás -> nincs új verzió
    
    next_version = (last.version_number + 1) if last else 1
    version = VersionControl(
        entity_type=entity_type,
        entity_id=entity_id,
        version_number=next_version,
        data=snapshot,
        created_by_id=ctx.user.id,
    )
    ctx.db.add(version)
    await ctx.db.flush()
    return version

async def get_versions_with_diff(db: AsyncSession, entity_type: str, entity_id: int) -> list[dict]:
    result = await db.scalars(
        select(VersionControl).options(
            selectinload(VersionControl.created_by)
        )
        .where(VersionControl.entity_type == entity_type, VersionControl.entity_id == entity_id)
        .order_by(VersionControl.version_number.asc())
    )
    versions = result.all()
    output = []
    prev_data = {}
    for v in versions:
        changes = {
            field: {"old": prev_data.get(field), "new": new_val}
            for field, new_val in v.data.items()
            if prev_data.get(field) != new_val
        }
        output.append({
            "version_number": v.version_number,
            "created_at": v.created_at,
            "created_by_id": v.created_by_id,
            "created_by_name": v.created_by.name if v.created_by else "",
            "created_by_picture": v.created_by.picture if v.created_by else "",
            "data": v.data,
            "changes": changes,  # üres dict = ez az induló (1.) verzió teljes mezőkészlete
        })
        prev_data = v.data
    return output