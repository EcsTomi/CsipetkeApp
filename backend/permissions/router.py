"""
Permission and role management endpoints.
"""

from fastapi import APIRouter, Query, Request, status

from admission_middleware import AdmissionControlMiddleware
from auth.deps import AdminContext
from database import AsyncSessionLocal
from permissions import service
from permissions.schemas import (
    AdminSummary,
    PermissionRow,
    RoleDetailResponse,
    RoleRow,
    RoleUpdateRequest,
    SetUserPermissionOverrideRequest,
    SetUserRolesRequest,
    UserAdminRow,
    UserRoleAssignment,
    UserSummary,
)
from rate_limit_middleware import GlobalRateLimitMiddleware

router = APIRouter(prefix="/admin", tags=["Jogkezelés"])


# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------

@router.get("/permissions", response_model=list[PermissionRow])
async def list_permissions(ctx: AdminContext) -> list[PermissionRow]:
    return await service.list_permissions(ctx)


# ---------------------------------------------------------------------------
# Roles
# ---------------------------------------------------------------------------

@router.get("/roles", response_model=list[RoleRow])
async def list_roles(ctx: AdminContext) -> list[RoleRow]:
    return await service.list_roles(ctx)


@router.get("/roles/{role_code}", response_model=RoleDetailResponse)
async def get_role(
    role_code: str,
    ctx: AdminContext,
) -> RoleDetailResponse:
    return await service.get_role(ctx, role_code)


@router.put("/roles/{role_code}", response_model=RoleDetailResponse)
async def update_role(
    role_code: str,
    req: RoleUpdateRequest,
    ctx: AdminContext,
) -> RoleDetailResponse:
    result = await service.update_role(ctx, role_code, req)
    return result


# ---------------------------------------------------------------------------
# Felhasználók (lista az admin felülethez)
# ---------------------------------------------------------------------------

@router.get("/users", response_model=list[UserAdminRow])
async def list_users(
    ctx: AdminContext,
    search: str | None = Query(default=None, description="Név vagy e-mail részlete"),
    role_code: str | None = Query(default=None),
    class_year: int | None = Query(default=None),
    class_letter: str | None = Query(default=None),
) -> list[UserAdminRow]:
    return await service.list_users(
        ctx=ctx,
        search=search,
        role_code=role_code,
        class_year=class_year,
        class_letter=class_letter,
    )

@router.get("/users/summary", response_model=UserSummary)
async def get_user_summary(ctx: AdminContext) -> UserSummary:
    return await service.get_user_summary(ctx)

# ---------------------------------------------------------------------------
# User ↔ Role & Permission overrides
# ---------------------------------------------------------------------------

@router.get("/users/{user_id}/roles", response_model=UserRoleAssignment)
async def get_user_roles(
    user_id: int,
    ctx: AdminContext,
) -> UserRoleAssignment:
    return await service.get_user_role_assignments(ctx, user_id)


@router.put("/users/{user_id}/roles", status_code=status.HTTP_204_NO_CONTENT)
async def set_user_roles(
    user_id: int,
    req: SetUserRolesRequest,
    ctx: AdminContext,
) -> None:
    await service.set_user_roles(ctx, user_id, req.role_code)


@router.put("/users/{user_id}/permissions", status_code=status.HTTP_204_NO_CONTENT)
async def set_user_permission_override(
    user_id: int,
    req: SetUserPermissionOverrideRequest,
    ctx: AdminContext,
) -> None:
    await service.set_user_permission_override(ctx, user_id, req.permission_code, req.granted)


@router.delete("/users/{user_id}/permissions/{permission_code}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_user_permission_override(
    user_id: int,
    permission_code: str,
    ctx: AdminContext,
) -> None:
    await service.remove_user_permission_override(ctx, user_id, permission_code)


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

@router.get("/analytics")
async def get_admin_summary(request: Request, ctx: AdminContext) -> AdminSummary:
    rate_stats = GlobalRateLimitMiddleware.instance.get_stats()
    admission_stats = AdmissionControlMiddleware.instance.get_stats()

    return {
        **rate_stats,
        **admission_stats,
    }