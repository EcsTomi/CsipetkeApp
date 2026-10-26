from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import HTTPException, status
from sqlalchemy import asc, select
from sqlalchemy.orm import selectinload

from audit_log.service import log_audit
from models.user import User
from task.schemas import TaskResponse, CreateTask, UpdateTask
from models.task import Task
from models.task_submission import TaskSubmission
from auth.deps import EngineContext, check_for_any_permission
from version.service import make_snapshot, save_version_if_changed

from websocket.manager import websocket_manager

# Segéd függvények

async def _apply_task_visibility_safe(ctx: EngineContext, task: TaskResponse) -> None:
    """
    A feladat szempontok megjelenítésének szabályozása.
    """

    can_see_submissions = await check_for_any_permission(ctx, "submission.list_other", "submission.all")
    can_see_submission_details = await check_for_any_permission(ctx, "submission.all")
    can_see_points = await check_for_any_permission(ctx, "task.edit", "program.manage", "jury.score", "point.onsite")
    if not can_see_submissions:
        task.submissions = []
    if not can_see_points:
        task.max_points = None
        task.placement_points = None
    if not can_see_submission_details:
        for submission in task.submissions:
            submission.original_filename = ""
            submission.content_type = ""
            submission.size_bytes = 0
            submission.user = ""

async def _get_task(task_id: int, ctx: EngineContext) -> Task:
    # Feladat lekérdezése ID alapján
    task = await ctx.db.scalar(
        select(Task)
        .where(Task.id == task_id)
        .options(
            selectinload(Task.modified_by),
            selectinload(Task.submissions).selectinload(TaskSubmission.user).selectinload(User.role),
        )
    )

    return task

async def _is_task_hidden(ctx: EngineContext, task: Task) -> bool:
    if task.is_deleted == True:
        return True
    if not task.previously_public:
        return True
    now_local = datetime.now(ZoneInfo("Europe/Budapest"))
    return task.visible_from > now_local

#          / - - - - - - - - - \
#          |     Feladatok     |
#          \ _ _ _ _ _ _ _ _ _ /

async def get_all_tasks(ctx: EngineContext) -> list[TaskResponse]:
    stmt = select(Task)
    if not await check_for_any_permission(ctx, "task.hidden", "task.edit"):
        stmt = stmt.where(Task.is_visible == True) # Jogosultság szükséges a megjelenés előtti feladatok megtekintéséhez
    if not await check_for_any_permission(ctx, "task.restore"):
        stmt = stmt.where(Task.is_deleted == False)
    stmt = stmt.options(
        selectinload(Task.modified_by).selectinload(User.role),
        selectinload(Task.submissions).selectinload(TaskSubmission.user).selectinload(User.role),
    )
    stmt = stmt.order_by(asc(Task.visible_from))

    tasks = await ctx.db.scalars(stmt)
    task_list = tasks.all()
    task_list_out = []
    for task in task_list:
        task_list_out.append(TaskResponse.model_validate(task))
    return task_list_out


async def create_task(task_in: CreateTask, ctx: EngineContext) -> TaskResponse:
    existing_task = await ctx.db.scalars(
        select(Task).where(
            Task.name == task_in.name,
            Task.is_deleted == False,
        )
    )
    if(existing_task.first()):
        await log_audit(ctx, "task.create", target_id=existing_task.first().id, target_name=existing_task.first().name, return_code=status.HTTP_400_BAD_REQUEST, meta={"message": "Már létezik ilyen nevű feladat."})
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Már létezik ilyen nevű feladat.")
    
    task = Task(
        name=task_in.name,
        details=task_in.details,
        previously_public=task_in.previously_public,
        visible_from=task_in.visible_from.replace(tzinfo=ZoneInfo("Europe/Budapest")),
        available_from=(task_in.available_from.replace(tzinfo=ZoneInfo("Europe/Budapest")) if task_in.available_from is not None else None),
        file_upload=task_in.file_upload,
        deadline=(task_in.deadline.replace(tzinfo=ZoneInfo("Europe/Budapest")) if task_in.deadline is not None else None),
        scoring_type=task_in.scoring_type,
        max_points=task_in.max_points,
        placement_points=task_in.placement_points,
        modified_by_id=ctx.user.id, modified_at=datetime.now(ZoneInfo("Europe/Budapest")))
    
    ctx.db.add(task)
    await ctx.db.commit()
    await ctx.db.refresh(task)

    task = await _get_task(task.id, ctx)
    await save_version_if_changed("task", task.id, make_snapshot(task, "task"), ctx)
    await log_audit(ctx, "task.create", target_id=task.id, target_name=task.name, return_code=status.HTTP_201_CREATED)
    await websocket_manager.broadcast(
        "task.create",
        TaskResponse.model_validate(task),
        require_all_permissions=["task.hidden", "task.view"] if await _is_task_hidden(ctx, task) else ["task.view"],
        exclude_user_id=ctx.user.id,
    )
    return task


async def update_task(id: int, task_in: UpdateTask, ctx: EngineContext) -> TaskResponse:
    result = await ctx.db.execute(
        select(Task).where(
            Task.id == id
        )
    )
    task = result.scalar()
    if not task:
        await log_audit(ctx, "task.update", target_id=id, target_name=task_in.name, return_code=status.HTTP_404_NOT_FOUND, meta={"message": "Nincs ilyen feladat"})
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nincs ilyen feladat")
    
    task.name = task_in.name
    task.details = task_in.details
    task.previously_public = task_in.previously_public
    task.visible_from = task_in.visible_from.replace(tzinfo=ZoneInfo("Europe/Budapest"))
    task.available_from = task_in.available_from
    if(task_in.available_from is not None):
        task.available_from = task_in.available_from.replace(tzinfo=ZoneInfo("Europe/Budapest"))
    task.file_upload = task_in.file_upload
    task.deadline = task_in.deadline
    if(task_in.deadline is not None):
        task.deadline = task_in.deadline.replace(tzinfo=ZoneInfo("Europe/Budapest"))
    task.scoring_type = task_in.scoring_type
    task.max_points = task_in.max_points
    task.placement_points = task_in.placement_points
    task.modified_by_id = ctx.user.id
    task.modified_at = datetime.now(ZoneInfo("Europe/Budapest"))
    task.is_deleted = task_in.is_deleted

    await ctx.db.commit()
    await ctx.db.refresh(task)

    task = await _get_task(task.id, ctx)
    await save_version_if_changed("task", task.id, make_snapshot(task, "task"), ctx)
    await log_audit(ctx, "task.update", target_id=task.id, target_name=task.name, return_code=status.HTTP_200_OK)
    await websocket_manager.broadcast(
        "task.update",
        TaskResponse.model_validate(task),
        require_all_permissions=["task.hidden", "task.view"] if await _is_task_hidden(ctx, task) else ["task.view"],
    )
    return task

async def delete_task(id: int, ctx: EngineContext):
    result = await ctx.db.execute(
        select(Task).where(
            Task.id == id,
            Task.is_deleted == False,
        )
    )
    task = result.scalar()
    if not task:
        await log_audit(ctx, "task.delete", target_id=id, return_code=status.HTTP_404_NOT_FOUND, meta={"message": "Nincs ilyen feladat"})
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nincs ilyen feladat")
    
    task.is_deleted = True
    task.modified_by_id = ctx.user.id
    task.modified_at = datetime.now(ZoneInfo("Europe/Budapest"))

    await ctx.db.commit()
    await ctx.db.refresh(task)

    task = await _get_task(task.id, ctx)
    await save_version_if_changed("task", task.id, make_snapshot(task, "task"), ctx)
    await log_audit(ctx, "task.delete", target_id=task.id, target_name=task.name, return_code=status.HTTP_200_OK)
    await websocket_manager.broadcast(
        "task.delete",
        {"id": task.id},
        require_all_permissions=["task.view"],
    )
    await websocket_manager.broadcast(
        "task.create",
        TaskResponse.model_validate(task),
        require_all_permissions=["task.restore", "task.view"],
    )
    return