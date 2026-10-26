import mimetypes
import os
import uuid
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi.responses import FileResponse
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from sqlalchemy.dialects.postgresql import insert as pg_insert
from fastapi import HTTPException, UploadFile, status

from audit_log.service import log_audit
from auth.deps import EngineContext, check_for_any_permission
from models.vote import Vote
from models.vote_option import VoteOption
from models.vote_allocation import VoteAllocation
from models.vote_option_snapshot import VoteOptionSnapshot
from models.user import User
from vote.schemas import AddVoteOption, CreateVote, UpdateVote, VoteOptionResponse, VoteResponse

from websocket import websocket_manager

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads" / "vote_options"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _resolve_image_path(image_path: str | None) -> Path | None:
    if not image_path:
        return None
    path = Path(image_path)
    if not path.is_absolute():
        path = BASE_DIR / path
    return path

async def _is_vote_hidden(ctx: EngineContext, vote: Vote) -> bool:
    if vote.is_deleted == True:
        return True
    now_local = datetime.now(ZoneInfo("Europe/Budapest"))
    return vote.visible_from > now_local

async def get_votes(ctx: EngineContext) -> list[VoteResponse]:
    """Az összes szavazás lekérdezése."""
    stmt = select(Vote).options(selectinload(Vote.options), selectinload(Vote.modified_by).selectinload(User.role))
    if not await check_for_any_permission(ctx, "vote.hidden", "vote.edit"):
        # Csak a jogosult felhasználók láthatják publikálás előtt
        stmt = stmt.where(Vote.visible_from <= datetime.now(ZoneInfo("Europe/Budapest")))
    if not await check_for_any_permission(ctx, "vote.restore"):
        stmt = stmt.where(Vote.is_deleted == False)
    result = await ctx.db.execute(stmt)
    votes = list(result.scalars().unique().all())
    votes_out : list[VoteResponse] = []
    for vote in votes:
        votes_out.append(VoteResponse.model_validate(vote))
    for v in votes_out:
        # Saját szavazat kiírása
        all = await get_my_allocation(v.id, ctx)
        if all:
            v.my_allocation = all.option_id
        else:
            v.my_allocation = None
    return votes_out


async def _get_vote(vote_id: int, ctx: EngineContext) -> Vote:
    stmt = select(Vote).where(Vote.id == vote_id).options(selectinload(Vote.options))
    if not await check_for_any_permission(ctx, "vote.restore"):
        stmt = stmt.where(Vote.is_deleted == False)
    vote = (await ctx.db.execute(stmt)).scalar_one_or_none()
    if vote is None:
        raise HTTPException(404, "A szavazás nem található")
    return vote


async def create_vote(data: CreateVote, ctx: EngineContext) -> Vote:
    vote = Vote(
        name=data.name,
        visible_from=data.visible_from.replace(tzinfo=ZoneInfo("Europe/Budapest")),
        available_from=data.available_from.replace(tzinfo=ZoneInfo("Europe/Budapest")),
        deadline=(data.deadline.replace(tzinfo=ZoneInfo("Europe/Budapest")) if data.deadline is not None else None),
        modified_by_id=ctx.user.id,
    )

    ctx.db.add(vote)
    await ctx.db.commit()
    await ctx.db.refresh(vote, attribute_names=["options"])
    await log_audit(ctx, "vote.create", target_id=vote.id, target_name=vote.name, return_code=status.HTTP_201_CREATED)
    await websocket_manager.broadcast(
        "vote.create",
        VoteResponse.model_validate(vote),
        require_all_permissions=["vote.hidden", "vote.vote"] if await _is_vote_hidden(ctx, vote) else ["vote.vote"],
        exclude_user_id=ctx.user.id,
    )
    return vote


async def update_vote(vote_id: int, data: UpdateVote, ctx: EngineContext) -> Vote:
    vote = await _get_vote(vote_id, ctx)

    vote.name = data.name
    vote.visible_from = data.visible_from.replace(tzinfo=ZoneInfo("Europe/Budapest"))
    vote.available_from = data.available_from.replace(tzinfo=ZoneInfo("Europe/Budapest"))
    vote.deadline = data.deadline
    if(data.deadline is not None):
        vote.deadline = data.deadline.replace(tzinfo=ZoneInfo("Europe/Budapest"))
    vote.modified_by_id = ctx.user.id
    vote.modified_at = datetime.now(ZoneInfo("Europe/Budapest"))
    vote.is_deleted = data.is_deleted

    await ctx.db.commit()
    await ctx.db.refresh(vote, attribute_names=["options"])
    await log_audit(ctx, "vote.update", target_id=vote.id, target_name=vote.name, return_code=status.HTTP_200_OK)
    await websocket_manager.broadcast(
        "vote.update",
        VoteResponse.model_validate(vote),
        require_all_permissions=["vote.hidden", "vote.vote"] if await _is_vote_hidden(ctx, vote) else ["vote.vote"],
        exclude_user_id=ctx.user.id,
    )
    return vote

async def delete_vote(vote_id: int, ctx: EngineContext) -> Vote:
    vote = await _get_vote(vote_id, ctx)
    vote.is_deleted = True
    vote.modified_at = datetime.now(ZoneInfo("Europe/Budapest"))
    vote.modified_by_id = ctx.user.id

    await ctx.db.commit()
    await ctx.db.refresh(vote, attribute_names=["options"])
    await log_audit(ctx, "vote.delete", target_id=vote.id, target_name=vote.name, return_code=status.HTTP_200_OK)
    await websocket_manager.broadcast(
        "vote.delete",
        {"id": vote.id},
        require_all_permissions=["vote.vote"],
        exclude_user_id=ctx.user.id,
    )
    await websocket_manager.broadcast(
        "vote.create",
        VoteResponse.model_validate(vote),
        require_all_permissions=["vote.restore", "vote.vote"],
        exclude_user_id=ctx.user.id,
    )
    return vote

async def add_option(vote_id: int, data: AddVoteOption, ctx: EngineContext) -> VoteOption:
    vote = await _get_vote(vote_id, ctx)
    option = VoteOption(vote_id=vote.id, name=data.name)
    ctx.db.add(option)
    vote.modified_at = datetime.now(ZoneInfo("Europe/Budapest"))
    vote.modified_by_id = ctx.user.id
    await ctx.db.commit()
    await ctx.db.refresh(option)
    await log_audit(ctx, "vote_option.create", target_id=option.id, target_name=option.name, return_code=status.HTTP_201_CREATED)
    await websocket_manager.broadcast(
        "vote_option.create",
        VoteOptionResponse.model_validate(option),
        require_all_permissions=["vote.hidden", "vote.vote"] if await _is_vote_hidden(ctx, vote) else ["vote.vote"],
        exclude_user_id=ctx.user.id,
    )
    return option

async def update_option(vote_id: int, option_id: int, data: AddVoteOption, ctx: EngineContext) -> VoteOption:
    vote = await _get_vote(vote_id, ctx)
    option = await ctx.db.get(VoteOption, option_id)
    if option is None or option.vote_id != vote_id:
        raise HTTPException(404, "Az opció nem található")
    
    option.name = data.name

    vote.modified_at = datetime.now(ZoneInfo("Europe/Budapest"))
    vote.modified_by_id = ctx.user.id
    await ctx.db.commit()
    await ctx.db.refresh(option)
    await log_audit(ctx, "vote_option.update", target_id=option.id, target_name=option.name, return_code=status.HTTP_200_OK)
    await websocket_manager.broadcast(
        "vote_option.update",
        VoteOptionResponse.model_validate(option),
        require_all_permissions=["vote.hidden", "vote.vote"] if await _is_vote_hidden(ctx, vote) else ["vote.vote"],
        exclude_user_id=ctx.user.id,
    )
    return option


async def delete_option(vote_id: int, option_id: int, ctx: EngineContext) -> None:
    vote = await _get_vote(vote_id, ctx)
    option = await ctx.db.get(VoteOption, option_id)
    if option is None or option.vote_id != vote_id:
        raise HTTPException(404, "Az opció nem található")

    has_votes = await ctx.db.scalar(
        select(func.count()).select_from(VoteAllocation).where(VoteAllocation.option_id == option_id)
    )
    if has_votes:
        await log_audit(ctx, "vote_option.delete", target_id=option.id, target_name=option.name, return_code=status.HTTP_409_CONFLICT, meta={"message": "Az opció nem törölhető, mert már érkezett rá szavazat"})
        raise HTTPException(409, "Az opció nem törölhető, mert már érkezett rá szavazat")

    old_path = _resolve_image_path(option.image_path)
    if old_path and old_path.exists():
        old_path.unlink()

    vote.modified_at = datetime.now(ZoneInfo("Europe/Budapest"))
    vote.modified_by_id = ctx.user.id

    await ctx.db.delete(option)
    await ctx.db.commit()
    await log_audit(ctx, "vote_option.delete", target_id=option.id, target_name=option.name, return_code=status.HTTP_200_OK)
    await websocket_manager.broadcast(
        "vote_option.delete",
        {"id": option.id},
        require_all_permissions=["vote.hidden", "vote.vote"] if await _is_vote_hidden(ctx, vote) else ["vote.vote"],
        exclude_user_id=ctx.user.id,
    )
    return

async def set_option_image(
    vote_id: int, option_id: int, file: UploadFile, ctx: EngineContext
) -> VoteOption:
    vote = await _get_vote(vote_id, ctx)
    option = await ctx.db.get(VoteOption, option_id)
    if option is None or option.vote_id != vote_id:
        raise HTTPException(404, "Az opció nem található")

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        await log_audit(ctx, "vote_option.set_image", target_id=option.id, target_name=option.name, return_code=status.HTTP_400_BAD_REQUEST, meta={"message": "Csak kép tölthető fel (jpeg, png, webp, gif)", "file_type": file.content_type})
        raise HTTPException(400, "Csak kép tölthető fel (jpeg, png, webp, gif)")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".bin"
    new_filename = f"{uuid.uuid4().hex}{ext}"
    new_path = UPLOAD_DIR / new_filename
    tmp_path = new_path.with_suffix(new_path.suffix + ".tmp")

    try:
        with open(tmp_path, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                out.write(chunk)
        os.replace(tmp_path, new_path)  # atomi csere
    finally:
        if tmp_path.exists():
            tmp_path.unlink()

    old_path = _resolve_image_path(option.image_path)
    option.image_path = str(new_path.relative_to(BASE_DIR))

    vote.modified_at = datetime.now(ZoneInfo("Europe/Budapest"))
    vote.modified_by_id = ctx.user.id

    await ctx.db.commit()

    # a régi fájlt csak a commit után töröljük, ha volt
    if old_path and old_path.exists():
        old_path.unlink()

    await ctx.db.refresh(option)
    await log_audit(ctx, "vote_option.set_image", target_id=option.id, target_name=option.name, return_code=status.HTTP_200_OK, meta={"image_path": option.image_path, "file_name": file.filename})

    await websocket_manager.broadcast(
        "vote_option.set_image",
        {"id": option.id},
        require_all_permissions=["vote.hidden", "vote.vote"] if await _is_vote_hidden(ctx, vote) else ["vote.vote"],
        exclude_user_id=ctx.user.id,
    )
    return option

async def get_option_image(vote_id: int, option_id: int, ctx: EngineContext) -> FileResponse:
    option = await ctx.db.get(VoteOption, option_id)
    if option is None or option.vote_id != vote_id:
        raise HTTPException(404, "Az opció nem található")
    if not option.image_path:
        raise HTTPException(404, "Nincs feltöltött kép")

    image_path = Path(option.image_path)
    if not image_path.is_absolute():
        image_path = Path(__file__).resolve().parent.parent / image_path

    if not image_path.exists():
        raise HTTPException(404, "A kép nem található")

    media_type, _ = mimetypes.guess_type(image_path.name)
    return FileResponse(path=image_path, media_type=media_type or "application/octet-stream")


async def submit_allocation(
    vote_id: int, option_id: int, ctx: EngineContext
) -> list[dict]:
    vote = await _get_vote(vote_id, ctx)

    if not vote.is_open:
        raise HTTPException(400, "A szavazás jelenleg nem aktív")

    valid_option_ids = {o.id for o in vote.options}
    if not option_id in valid_option_ids:
        raise HTTPException(400, "Érvénytelen opció")

    # Atomi upsert — nincs race condition, nincs delete+insert rés
    stmt = pg_insert(VoteAllocation).values(
        vote_id=vote_id, option_id=option_id, user_id=ctx.user.id
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["vote_id", "user_id"],   # lásd lent — ehhez kell egy DB-módosítás
        set_={"option_id": stmt.excluded.option_id, "updated_at": stmt.excluded.updated_at},
    )
    await ctx.db.execute(stmt)
    await ctx.db.flush()

    # minden opció totálját frissítjük (nem csak az érintetteket - az elmaradt/törölt
    # opcióknál is csökkenhetett a total, azoknak is kell snapshot)
    totals_result = await ctx.db.execute(
        select(VoteAllocation.option_id, func.count(VoteAllocation.id))
        .where(VoteAllocation.option_id.in_(valid_option_ids))
        .group_by(VoteAllocation.option_id)
    )
    totals = dict(totals_result.all())
    results = [{"option_id": oid, "total": totals.get(oid, 0)} for oid in valid_option_ids]
    vote.last_voted_at = datetime.now(ZoneInfo("Europe/Budapest"))
    await ctx.db.commit()
    await websocket_manager.broadcast(
        "vote_results", {"vote_id": vote_id, "results": results}
    )
    return results


async def get_my_allocation(vote_id: int, ctx: EngineContext) -> VoteAllocation | None:
    stmt = select(VoteAllocation).where(
        VoteAllocation.vote_id == vote_id, VoteAllocation.user_id == ctx.user.id
    )
    result = await ctx.db.execute(stmt)
    return result.scalars().first()


async def get_results(vote_id: int, ctx: EngineContext) -> list[dict]:
    vote = await _get_vote(vote_id, ctx)
    stmt = (
        select(VoteAllocation.option_id, func.coalesce(func.count(VoteAllocation.id), 0).label("total"))
        .where(VoteAllocation.vote_id == vote_id)
        .group_by(VoteAllocation.option_id)
    )
    result = await ctx.db.execute(stmt)
    totals = {row.option_id: row.total for row in result}

    # minden opciót visszaadunk, 0-val is, ha még nincs rá szavazat
    return [{"option_id": o.id, "total": totals.get(o.id, 0)} for o in vote.options]


async def get_history(vote_id: int, ctx: EngineContext) -> list[dict]:
    vote = await _get_vote(vote_id, ctx)
    option_ids = [o.id for o in vote.options]

    stmt = (
        select(VoteOptionSnapshot)
        .where(VoteOptionSnapshot.option_id.in_(option_ids))
        .order_by(VoteOptionSnapshot.option_id, VoteOptionSnapshot.created_at)
    )
    result = await ctx.db.execute(stmt)
    snapshots = result.scalars().all()

    by_option: dict[int, list] = {oid: [] for oid in option_ids}
    for s in snapshots:
        by_option[s.option_id].append({"created_at": s.created_at, "total": s.total})

    return [{"option_id": oid, "points": points} for oid, points in by_option.items()]