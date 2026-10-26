import hashlib
import io
import uuid
import asyncio
from pathlib import Path

from fastapi import UploadFile, HTTPException, status
import pyvips
from sqlalchemy import select

from audit_log.service import log_audit
from auth.deps import EngineContext
from models.archive_photo import ArchivePhoto
from archive.schemas import ArchivePhotoResponse
from archive.validation import validate_archive_upload, MAX_DIMENSION
from websocket.manager import websocket_manager

ARCHIVE_ROOT = Path("archive_photos")
CHUNK_SIZE = 1024 * 1024

# szélesség px-ben, a magasság arányosan skálázódik
SIZES: dict[str, int] = {
    "thumb": 320,
    "medium": 960,
    "full": 1600,
}


def _process_image_sync(raw: bytes, dest_dir: Path, stored_hash: str) -> tuple[int, int]:
    """CPU-bound: resize + encode minden méretben. (PIL nélkül, pyvips-szel)"""
    # Betöltés memóriából + EXIF orientáció automatikus korrekciója (autorot)
    img = pyvips.Image.new_from_buffer(raw, "")
    img = img.autorot()

    orig_w, orig_h = img.width, img.height

    for label, target_w in SIZES.items():
        if orig_w <= target_w:
            resized = img
        else:
            scale = target_w / orig_w
            # Lanczos átméretezés
            resized = img.resize(scale, kernel="lanczos3")

        # Mentés WEBP és JPEG formátumba
        resized.webpsave(
            dest_dir / f"{stored_hash}_{label}.webp", 
            Q=80, 
            effort=6
        )
        resized.jpegsave(
            dest_dir / f"{stored_hash}_{label}.jpg", 
            Q=85, 
            optimize_coding=True
        )

    return orig_w, orig_h


async def save_archive_photo(ctx: EngineContext, file: UploadFile, caption: str | None) -> ArchivePhoto:
    if not file.filename:
        raise HTTPException(400, "Nincs fájl.")

    ARCHIVE_ROOT.mkdir(parents=True, exist_ok=True)

    hasher = hashlib.sha1()
    buf = io.BytesIO()
    size = 0
    while chunk := await file.read(CHUNK_SIZE):
        size += len(chunk)
        if size > 25 * 1024 * 1024:
            raise HTTPException(413, "A kép túl nagy.")
        hasher.update(chunk)
        buf.write(chunk)

    await validate_archive_upload(file, size, ctx)

    raw = buf.getvalue()
    stored_hash = hasher.hexdigest()[:24] + uuid.uuid4().hex[:8]

    existing = await ctx.db.scalar(select(ArchivePhoto).where(ArchivePhoto.stored_hash == stored_hash))
    if existing:
        return existing  # ugyanaz a fájl már fent van, nincs teendő

    try:
        width, height = await asyncio.to_thread(_process_image_sync, raw, ARCHIVE_ROOT, stored_hash)
    except Exception:
        await log_audit(ctx, "archive_photo.upload", return_code=status.HTTP_400_BAD_REQUEST,
                         meta={"filename": file.filename, "size": size, "message": "A kép nem dolgozható fel (sérült fájl?)."})
        raise HTTPException(400, "A kép nem dolgozható fel — lehet, hogy sérült a fájl.")

    if width > MAX_DIMENSION or height > MAX_DIMENSION:
        for label in SIZES:
            (ARCHIVE_ROOT / f"{stored_hash}_{label}.webp").unlink(missing_ok=True)
            (ARCHIVE_ROOT / f"{stored_hash}_{label}.jpg").unlink(missing_ok=True)
        raise HTTPException(415, "A kép felbontása túl nagy.")

    photo = ArchivePhoto(
        stored_hash=stored_hash,
        original_filename=file.filename,
        content_type=file.content_type or "image/jpeg",
        size_bytes=size,
        width=width,
        height=height,
        caption=caption,
        uploaded_by_id=ctx.user.id,
    )
    ctx.db.add(photo)
    await ctx.db.commit()
    await ctx.db.refresh(photo, attribute_names=["uploaded_by"])

    await log_audit(ctx, "archive_photo.upload", target_id=photo.id, target_name=file.filename,
                     return_code=status.HTTP_200_OK, meta={"size": size})

    await websocket_manager.broadcast(
        "archive_photo.upload",
        ArchivePhotoResponse.model_validate(photo).model_dump(mode="json"),
    )
    return photo


async def delete_archive_photo(ctx: EngineContext, photo_id: int) -> None:
    photo = await ctx.db.get(ArchivePhoto, photo_id)
    if photo is None or photo.is_deleted:
        raise HTTPException(404, "A kép nem található.")

    photo.is_deleted = True
    await ctx.db.commit()

    for label in SIZES:
        (ARCHIVE_ROOT / f"{photo.stored_hash}_{label}.webp").unlink(missing_ok=True)
        (ARCHIVE_ROOT / f"{photo.stored_hash}_{label}.jpg").unlink(missing_ok=True)

    await log_audit(ctx, "archive_photo.remove", target_id=photo.id, target_name=photo.original_filename,
                     return_code=status.HTTP_200_OK)
    await websocket_manager.broadcast("archive_photo.remove", {"id": photo.id})