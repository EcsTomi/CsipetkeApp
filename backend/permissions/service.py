"""
Permission and role management service.
"""

import logging
import time
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from audit_log.service import log_audit
from auth.deps import EngineContext
from database import AsyncSessionLocal
from models import Role, Permission, RolePermission, UserPermission
from models.user import User
from permissions.schemas import (
    PermissionRow,
    RoleDetailResponse,
    RoleRow,
    RoleUpdateRequest,
    UserAdminRow,
    UserPermissionOverride,
    UserRoleAssignment,
    UserSummary,
)

from websocket.manager import websocket_manager
from threading import Lock

_permission_cache: dict[int, tuple[list[str], float]] = {}
_cache_lock = Lock()
CACHE_TTL_SECONDS = 300  # 5 perc

logger = logging.getLogger("logger")

_EFFECTIVE_PERMISSIONS_SQL = text("""
    SELECT DISTINCT p.code
    FROM permission p
    WHERE ((
          -- from roles
          EXISTS (
              SELECT 1 FROM "user" u
              JOIN role_permission rp ON u."role_code" = rp.role_code
              WHERE u.id = :user_id AND rp.permission_code = p.code
          )
          OR
          -- explicit user grant
          EXISTS (
              SELECT 1 FROM user_permission up
              WHERE up.user_id = :user_id AND up.permission_code = p.code AND up.granted = TRUE
          )
      )
      AND NOT EXISTS (
          -- explicit user deny overrides role grants
          SELECT 1 FROM user_permission up
          WHERE up.user_id = :user_id AND up.permission_code = p.code AND up.granted = FALSE
      ))
      OR EXISTS (
          -- explicit user admin overrides role grants
          SELECT 1 FROM "user" u
          WHERE u.id = :user_id AND u.role_code = 'admin'
      )
""")


async def get_effective_permissions(user_id: int, db: AsyncSession = None, use_cache: bool = True) -> List[str]:
    """
    Visszaadja az adott felhasználónak a jelenlegi jogosultságait.
    Ha kapunk egy request-scoped session-t (db), azt használjuk újra —
    HTTP request path-okon mindig ezt add át (ctx.db), hogy ne fogyasszunk
    plusz connectiont a poolból.
    Ha nincs átadva (pl. websocket connect, ahol nincs request-session),
    nyitunk egy rövid életű session-t.
    """
    if use_cache:
        cached = _permission_cache.get(user_id)
        if cached is not None:
            perms, expires_at = cached
            if time.monotonic() < expires_at:
                return perms
    async def _run(session: AsyncSession) -> List[str]:
        try:
            rows = (await session.execute(_EFFECTIVE_PERMISSIONS_SQL, {"user_id": user_id})).fetchall()
            return [r[0] for r in rows]
        except Exception as e:
            logger.error(f"get_effective_permissions hiba (user_id={user_id}): {e}")
            await session.rollback()
            return []

    if db is not None:
        result = await _run(db)
    else:
        async with AsyncSessionLocal() as session:
            result = await _run(session)

    if use_cache:
        _permission_cache[user_id] = (result, time.monotonic() + CACHE_TTL_SECONDS)

    return result

def invalidate_permission_cache(user_id: int | None = None) -> None:
    """
    user_id=None esetén a TELJES cache-t üríti (pl. role-permission mapping változásakor,
    ami sok usert egyszerre érinthet).
    """
    if user_id is None:
        _permission_cache.clear()
    else:
        _permission_cache.pop(user_id, None)
    

# ---------------------------------------------------------------------------
# Permission CRUD
# ---------------------------------------------------------------------------

async def list_permissions(ctx: EngineContext) -> List[PermissionRow]:
    rows = (await ctx.db.execute(select(Permission).order_by(Permission.category, Permission.code))).scalars().all()
    return [PermissionRow(id=p.id, code=p.code, name=p.name, description=p.description, category=p.category) for p in rows]

# ---------------------------------------------------------------------------
# Role CRUD
# ---------------------------------------------------------------------------

async def list_roles(ctx: EngineContext) -> List[RoleRow]:
    roles = (await ctx.db.execute(select(Role).order_by(Role.id))).scalars().all()
    return [RoleRow(id=r.id, code=r.code, name=r.name) for r in roles]


async def get_role(ctx: EngineContext, role_code: str) -> RoleDetailResponse:
    role = (await ctx.db.execute(select(Role).where(Role.code == role_code))).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    perm_rows = (await ctx.db.execute(
        select(Permission)
        .join(RolePermission, RolePermission.permission_code == Permission.code)
        .where(RolePermission.role_code == role_code)
        .order_by(Permission.category, Permission.code)
    )).scalars().all()
    permissions = [PermissionRow(id=p.id, code=p.code, name=p.name, description=p.description, category=p.category) for p in perm_rows]
    return RoleDetailResponse(id=role.id, code=role.code, name=role.name, permissions=permissions)

async def update_role(ctx: EngineContext, role_code: str, req: RoleUpdateRequest) -> RoleDetailResponse:
    role = (await ctx.db.execute(select(Role).where(Role.code == role_code))).scalar_one_or_none()
    if not role:
        await log_audit(ctx, "role.update", target_name=role_code, return_code=status.HTTP_404_NOT_FOUND, meta={"message": "Role not found"})
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    if req.permission_codes is not None:
        # ellenőrizzük, hogy csak létező permission code-okat kapunk
        existing_codes = set((await ctx.db.execute(select(Permission.code))).scalars().all())
        unknown = set(req.permission_codes) - existing_codes
        if unknown:
            await log_audit(ctx, "role.update", target_name=role_code, return_code=status.HTTP_400_BAD_REQUEST, meta={"message": f"Ismeretlen jogosultság kód(ok): {', '.join(sorted(unknown))}"})
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ismeretlen jogosultság kód(ok): {', '.join(sorted(unknown))}",
            )

        await ctx.db.execute(delete(RolePermission).where(RolePermission.role_code == role_code))
        for code in req.permission_codes:
            ctx.db.add(RolePermission(role_code=role_code, permission_code=code))

    await ctx.db.commit()
    invalidate_permission_cache()
    await log_audit(ctx, "role.update", target_name=role_code, return_code=status.HTTP_200_OK)
    return await get_role(ctx, role_code)

# ---------------------------------------------------------------------------
# User ↔ Role & Permission overrides
# ---------------------------------------------------------------------------

async def get_user_role_assignments(ctx: EngineContext, user_id: int) -> UserRoleAssignment:
    role_rows = (await ctx.db.execute(
        select(Role)
        .join(User, User.role_code == Role.code)
        .where(User.id == user_id)
    )).scalars().all()
    override_rows = (await ctx.db.execute(
        select(UserPermission, Permission)
        .join(Permission, Permission.code == UserPermission.permission_code)
        .where(UserPermission.user_id == user_id)
    )).all()
    roles = [RoleRow(id=r.id, code=r.code, name=r.name) for r in role_rows]
    overrides = [UserPermissionOverride(permission_code=up.permission_code, code=p.code, name=p.name, granted=up.granted) for up, p in override_rows]
    return UserRoleAssignment(user_id=user_id, roles=roles, overrides=overrides)


async def set_user_roles(ctx: EngineContext, user_id: int, role_code: str) -> None:
    # Frissíti a user role_code-ját a megadott (egyetlen) role-ra.
    user = (await ctx.db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        await log_audit(ctx, "user.set_role", target_id=user_id, return_code=status.HTTP_404_NOT_FOUND, meta={"message": "User not found"})
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if ctx.user.role_code != "admin":
        await log_audit(ctx, "user.set_role", target_id=user_id, return_code=status.HTTP_409_CONFLICT, meta={"message": "Csak az adminisztrátorok tudnak role-t kezelni!"})
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Csak az adminisztrátorok tudnak role-t kezelni!")
    if role_code:
        role_exists = (await ctx.db.execute(select(Role.code).where(Role.code == role_code))).scalar_one_or_none()
        if not role_exists:
            await log_audit(ctx, "user.set_role", target_id=user_id, return_code=status.HTTP_400_BAD_REQUEST, meta={"message": "Ismeretlen role kód"})
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ismeretlen role kód")

    user.role_code = role_code
    await ctx.db.commit()
    invalidate_permission_cache(user_id)
    await log_audit(ctx, "user.set_role", target_id=user_id, return_code=status.HTTP_200_OK, meta={"role": role_code})


async def set_user_permission_override(ctx: EngineContext, user_id: int, permission_code: str, granted: bool) -> None:
    existing = (await ctx.db.execute(
        select(UserPermission).where(UserPermission.user_id == user_id, UserPermission.permission_code == permission_code)
    )).scalar_one_or_none()
    if existing:
        existing.granted = granted
    else:
        ctx.db.add(UserPermission(user_id=user_id, permission_code=permission_code, granted=granted))
    await ctx.db.commit()
    invalidate_permission_cache(user_id)
    await log_audit(ctx, "user.set_permission_override", target_id=user_id, return_code=status.HTTP_200_OK, meta={"permission": permission_code, "granted": granted})

async def remove_user_permission_override(ctx: EngineContext, user_id: int, permission_code: str) -> None:
    await ctx.db.execute(
        delete(UserPermission).where(UserPermission.user_id == user_id, UserPermission.permission_code == permission_code)
    )
    await ctx.db.commit()
    invalidate_permission_cache(user_id)
    await log_audit(ctx, "user.remove_permission_override", target_id=user_id, return_code=status.HTTP_200_OK, meta={"permission": permission_code})

# ---------------------------------------------------------------------------
# Felhasználók listázása (admin)
# ---------------------------------------------------------------------------

async def list_users(
    ctx: EngineContext,
    search: Optional[str] = None,
    role_code: Optional[str] = None,
    class_year: Optional[int] = None,
    class_letter: Optional[str] = None,
) -> List[UserAdminRow]:
    """
    ~650 felhasználónál (l. Csipetke méretezési elvek) nem éri meg DB-collation
    vagy külön _search oszlop bevezetése egy admin listához — egyszerű, Python-oldali
    casefold szűrés a magyar ékezetes karakterekkel is jól bánik és elég gyors.
    """
    stmt = (
        select(User)
        .options(selectinload(User.role))
        .order_by(User.class_year, User.class_letter, User.name)
    )
    rows = (await ctx.db.execute(stmt)).scalars().all()

    needle = search.strip().casefold() if search else None

    def matches(u: User) -> bool:
        if role_code and u.role_code != role_code:
            return False
        if class_year is not None and u.class_year != class_year:
            return False
        if class_letter and u.class_letter != class_letter:
            return False
        if needle:
            haystack = f"{u.name} {u.email}".casefold()
            if needle not in haystack:
                return False
        return True

    filtered = [u for u in rows if matches(u)]

    activeUserIDs = websocket_manager.countActiveUsersById()

    return [
        UserAdminRow(
            id=u.id,
            name=u.name,
            email=u.email,
            picture=u.picture,
            class_year=u.class_year,
            class_letter=u.class_letter,
            role=RoleRow(id=u.role.id, code=u.role.code, name=u.role.name) if u.role else None,
            last_login=u.last_login,
            is_active=u.id in activeUserIDs,
            active_count=activeUserIDs[u.id] if u.id in activeUserIDs else 0,
            is_blocked=u.is_blocked,
        )
        for u in filtered
    ]

async def get_user_summary(ctx: EngineContext) -> UserSummary:
    stmt = select(func.count(User.id))
    user_count = (await ctx.db.execute(stmt)).scalar_one()
    active_count = len(websocket_manager.getActiveUsers())
    return UserSummary(user_count=user_count, active_count=active_count)