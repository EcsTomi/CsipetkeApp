# task_submission/service.py
import os, uuid
from pathlib import Path
from fastapi import UploadFile, HTTPException, status
from sqlalchemy import select

from audit_log.service import log_audit
from auth.deps import EngineContext
from models.task_submission import TaskSubmission
from models import Task, User
from task_submission.schemas import SubmissionResponse
from .validation import validate_submission, MAX_SIZE_BYTES

from websocket.manager import websocket_manager

UPLOAD_ROOT = Path("uploads")
CHUNK_SIZE = 1024 * 1024  # 1 MB
import aiofiles
import asyncio

async def save_submission(
    task: Task, ctx: EngineContext, file: UploadFile
) -> TaskSubmission:
    if not file.filename:
        raise HTTPException(400, "Nincs fájl.")
    ext = ("." + file.filename.rsplit(".", 1)[-1].lower()) if "." in file.filename else ""
    limit = MAX_SIZE_BYTES.get(task.file_upload, 20 * 1024 * 1024)

    task_dir = UPLOAD_ROOT / f"task_{task.id}"
    task_dir.mkdir(parents=True, exist_ok=True)  # ez gyors, maradhat sync
    tmp_name = f"{ctx.user.id}_{uuid.uuid4().hex}.tmp"
    tmp_path = task_dir / tmp_name

    size = 0
    try:
        async with aiofiles.open(tmp_path, "wb") as out:
            while chunk := await file.read(CHUNK_SIZE):
                size += len(chunk)
                if size > limit:
                    await log_audit(ctx, "task_submission.upload", target_id=task.id, target_name=task.name, return_code=status.HTTP_413_CONTENT_TOO_LARGE, meta={"filename": file.filename, "size": size, "message": f"A fájl mérete meghaladja a {limit // (1024*1024)} MB-os limitet."})
                    raise HTTPException(413, f"A fájl mérete meghaladja a {limit // (1024*1024)} MB-os limitet.")
                await out.write(chunk)

        # validáció a végleges méret/típus ismeretében
        await validate_submission(file, task, size, ctx)

        stored_filename = f"{ctx.user.id}_{uuid.uuid4().hex}{ext}"
        final_path = task_dir / stored_filename
        await asyncio.to_thread(tmp_path.rename, final_path)

        # meglévő beküldés lecserélése
        existing = await ctx.db.scalar(
            select(TaskSubmission).where(
                TaskSubmission.task_id == task.id, TaskSubmission.class_letter == ctx.user.class_letter
            )
        )
        if existing:
            old_path = UPLOAD_ROOT / f"task_{task.id}" / existing.stored_filename
            await asyncio.to_thread(old_path.unlink, True)
            existing.user_id = ctx.user.id
            existing.original_filename = file.filename
            existing.stored_filename = stored_filename
            existing.content_type = file.content_type or ""
            existing.size_bytes = size
            submission = existing
        else:
            submission = TaskSubmission(
                task_id=task.id,
                user_id=ctx.user.id,
                class_letter=ctx.user.class_letter,
                original_filename=file.filename,
                stored_filename=stored_filename,
                content_type=file.content_type,
                size_bytes=size,
            )
            ctx.db.add(submission)

        await ctx.db.commit()
        await ctx.db.refresh(submission, attribute_names=["user"])
        await ctx.db.refresh(submission.user, attribute_names=["role"])
        await log_audit(ctx, "task_submission.upload", target_id=task.id, target_name=task.name, return_code=status.HTTP_200_OK, meta={"filename": file.filename, "size": size})
        await websocket_manager.broadcast(
            "task_submission.upload",
            SubmissionResponse.model_validate(submission).model_dump(mode="json"),
            require_any_permissions=["submission.all", "submission.list_others"],
        )
        await websocket_manager.broadcast(
            "task_submission.upload",
            SubmissionResponse.model_validate(submission).model_dump(mode="json"),
            require_any_permissions=["submission.get_self"],
            class_letter=ctx.user.class_letter,
        )
        return submission
    finally:
        if tmp_path.exists():  # ez is sync stat-hívás, de elhanyagolható
            await asyncio.to_thread(tmp_path.unlink, True)