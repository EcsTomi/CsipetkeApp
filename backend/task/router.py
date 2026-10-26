from datetime import datetime
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from audit_log.service import log_audit
from models.version_control import VersionControl
from task.schemas import TaskResponse, CreateTask, UpdateTask
from models.task import Task
from auth.deps import EngineContext, require_any_permission, require_permission

from version.service import get_versions_with_diff, make_snapshot, save_version_if_changed
import task.service as task_service

router = APIRouter(prefix="/task", tags=["Feladatok"])

type TaskContext = Annotated[EngineContext, Depends(require_any_permission("task.view", "task.hidden", "task.edit"))]
type TaskEditContext = Annotated[EngineContext, Depends(require_permission("task.edit"))]

@router.get("", response_model=list[TaskResponse])
async def get_all_tasks(
    ctx: TaskContext,
):
    """
    Az összes feladat lekérdezése. (Adatok elrejtése jogosultságok szerint.)
    """
    tasks = await task_service.get_all_tasks(ctx)
    for task in tasks:
        await task_service._apply_task_visibility_safe(ctx, task)
    return tasks

@router.post("", response_model=TaskResponse)
async def create_task(
    task_in: CreateTask,
    ctx: TaskEditContext
):
    """
    Új feladat létrehozása.
    """
    return await task_service.create_task(task_in, ctx)

@router.put("/{id}", response_model=TaskResponse)
async def update_task(
    id: int,
    task_in: UpdateTask,
    ctx: TaskEditContext
):
    return await task_service.update_task(id, task_in, ctx)

@router.delete("/{id}")
async def delete_task(
    id: int,
    ctx: TaskEditContext
):
    return await task_service.delete_task(id, ctx)

# - - - Verziókontroll - - -


@router.get("/{task_id}/versions")
async def get_task_versions(task_id: int, ctx: TaskEditContext):
    return await get_versions_with_diff(ctx.db, "task", task_id)

@router.post("/{task_id}/versions/{version_number}/restore")
async def restore_task_version(task_id: int, version_number: int, ctx: TaskEditContext):
    version = await ctx.db.scalar(
        select(VersionControl).where(
            VersionControl.entity_type == "task",
            VersionControl.entity_id == task_id,
            VersionControl.version_number == version_number,
        )
    )
    if not version:
        await log_audit(ctx, "task.restore", target_id=task_id, return_code=status.HTTP_404_NOT_FOUND, meta={"version_number": version_number, "message": "Nincs ilyen verzió"})
        raise HTTPException(404, "Nincs ilyen verzió")
    task = await ctx.db.scalar(select(Task).where(Task.id == task_id))
    for field, value in version.data.items():
        # datetime mezőket vissza kell alakítani
        if field in ("visible_from", "available_from", "deadline") and value is not None:
            value = datetime.fromisoformat(value)
        setattr(task, field, value)
    await ctx.db.commit()
    await ctx.db.refresh(task)
    # a visszaállítás maga is új verziót hoz létre (git-szerű "revert")
    await save_version_if_changed("task", task_id, make_snapshot(task, "task"), ctx)
    await ctx.db.commit()
    await log_audit(ctx, "task.restore", target_id=task_id, target_name=task.name, return_code=status.HTTP_200_OK, meta={"version_number": version_number})
    return {"restored_to": version_number}