from typing import Annotated
from fastapi import APIRouter, Depends, UploadFile, File, Form, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from auth.deps import EngineContext, require_any_permission
from models.archive_photo import ArchivePhoto
from models.user import User
from .schemas import ArchivePhotoResponse
from .service import save_archive_photo, delete_archive_photo

router = APIRouter(prefix="/archive", tags=["Archívum"])

type ArchiveUploadContext = Annotated[EngineContext, Depends(require_any_permission("archive.upload"))]
type ArchiveViewContext = Annotated[EngineContext, Depends(require_any_permission("archive.view"))]


@router.get("", response_model=list[ArchivePhotoResponse])
async def list_archive_photos(ctx: ArchiveViewContext):
    result = await ctx.db.execute(
        select(ArchivePhoto).options(selectinload(ArchivePhoto.uploaded_by).selectinload(User.role)).where(ArchivePhoto.is_deleted == False).order_by(ArchivePhoto.uploaded_at.desc())
    )
    return list(result.scalars().all())


@router.put("", response_model=ArchivePhotoResponse)
async def upload_archive_photo(
    ctx: ArchiveUploadContext,
    file: UploadFile = File(...),
    caption: str | None = Form(None),
):
    return await save_archive_photo(ctx, file, caption)


@router.delete("/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_archive_photo(photo_id: int, ctx: ArchiveUploadContext):
    await delete_archive_photo(ctx, photo_id)