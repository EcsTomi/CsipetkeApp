# task_submission/router.py
from datetime import datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from audit_log.service import log_audit
from auth.deps import EngineContext, require_any_permission
from models.task import Task
from models.task_submission import TaskSubmission
from models.user import User
from task_submission.service import save_submission, UPLOAD_ROOT
from task_submission.schemas import SubmissionResponse

router = APIRouter(prefix="/task/{task_id}/submission", tags=["Fájl feltöltés"])

type TaskSubmissionSubmitContext = Annotated[EngineContext, Depends(require_any_permission("submission.submit"))]
type TaskSubmissionGetSelfContext = Annotated[EngineContext, Depends(require_any_permission("submission.get_self", "submission.submit"))]

type TaskSubmissionAllContext = Annotated[EngineContext, Depends(require_any_permission("submission.all"))]

@router.put("", response_model=SubmissionResponse)
async def upload_submission(
    task_id: int,
    ctx: TaskSubmissionSubmitContext,
    file: UploadFile = File(...),
):
    result = await ctx.db.execute(
        select(Task).where(
            Task.id == task_id,
            Task.is_deleted == False,
        )
    )
    task = result.scalar()
    if task is None:
        await log_audit(ctx, "task_submission.upload", target_id=task_id, return_code=status.HTTP_404_NOT_FOUND, meta={"filename": file.filename, "size": file.size, "message": "Nincs ilyen feladat"})
        raise HTTPException(404, "Feladat nem található")
    if task.available_from is not None and task.available_from > datetime.now(ZoneInfo("Europe/Budapest")):
        await log_audit(ctx, "task_submission.upload", target_id=task_id, target_name=task.name, return_code=status.HTTP_400_BAD_REQUEST, meta={"filename": file.filename, "size": file.size, "message": "Még nem lehet beküldeni a feladatot."})
        raise HTTPException(400, "Még nem lehet beküldeni a feladatot.")
    if task.deadline is not None and task.deadline < datetime.now(ZoneInfo("Europe/Budapest")):
        await log_audit(ctx, "task_submission.upload", target_id=task_id, target_name=task.name, return_code=status.HTTP_400_BAD_REQUEST, meta={"filename": file.filename, "size": file.size, "message": "Sajnáljuk, a feladat beküldési határideje lejárt."})
        raise HTTPException(400, "Sajnáljuk, a feladat beküldési határideje lejárt.")
    return await save_submission(task, ctx, file)


@router.get("/me", response_model=SubmissionResponse | None)
async def get_my_submission(
    task_id: int,
    ctx: TaskSubmissionGetSelfContext,
) -> TaskSubmission | None:
    """
    Lekérdezi az aktuális felhasználó osztályának fájlfeltöltését az adott feladathoz.
    """
    return await ctx.db.scalar(
        select(TaskSubmission).options(selectinload(TaskSubmission.user).selectinload(User.role)).where(
            TaskSubmission.task_id == task_id,
            TaskSubmission.class_letter == ctx.user.class_letter,
        )
    )


@router.get("", response_model=list[SubmissionResponse])
async def get_all_submissions(
    ctx: TaskSubmissionAllContext,
):
    """Szervezőknek: az összes beküldés lekérdezése."""
    result = await ctx.db.execute(select(TaskSubmission))
    return list(result.scalars().all())


async def _get_submission_or_404(ctx: EngineContext, task_id: int, class_letter: str) -> TaskSubmission:
    submission = await ctx.db.scalar(
        select(TaskSubmission).where(
            TaskSubmission.task_id == task_id,
            TaskSubmission.class_letter == class_letter,
        )
    )
    if submission is None:
        await log_audit(ctx, "task_submission.download", target_id=task_id, return_code=status.HTTP_404_NOT_FOUND, meta={"class_letter": class_letter, "message": "Nincs ilyen beküldés"})
        raise HTTPException(404, "Nincs beküldés")
    return submission


@router.get("/me/download")
async def download_my_submission(
    task_id: int,
    ctx: TaskSubmissionGetSelfContext,
):
    """Elsős: csak a saját beküldését töltheti le."""
    submission = await _get_submission_or_404(ctx, task_id, ctx.user.class_letter)
    return await _stream_submission(ctx, task_id, submission)


@router.get("/{class_letter}/download")
async def download_submission(
    task_id: int,
    class_letter: str,
    ctx: TaskSubmissionAllContext,
):
    """Szervező: bárkinek a beküldését letöltheti az adott feladathoz."""
    submission = await _get_submission_or_404(ctx, task_id, class_letter)
    return await _stream_submission(ctx, task_id, submission)


async def _stream_submission(ctx: EngineContext, task_id: int, submission: TaskSubmission) -> FileResponse:
    path = UPLOAD_ROOT / f"task_{task_id}" / submission.stored_filename
    if not path.exists():
        await log_audit(ctx, "task_submission.download", target_id=task_id, return_code=status.HTTP_410_GONE, meta={"class_letter": submission.class_letter, "message": "A fájl a szerveren nem található (törölve lett?)"})
        raise HTTPException(410, "A fájl a szerveren nem található (törölve lett?)")
    await log_audit(ctx, "task_submission.download", target_id=task_id, target_name=submission.original_filename, return_code=status.HTTP_200_OK)
    return FileResponse(
        path=path,
        filename=submission.original_filename,
        media_type=submission.content_type,
    )