from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
import jwt
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from dotenv import load_dotenv
import os
from sqlalchemy.ext.asyncio import AsyncSession
from deps import get_db
from models.user import User

load_dotenv()

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

oauth2_scheme = HTTPBearer()

def _credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Nem sikerült a hitelesítés.",
        headers={"WWW-Authenticate": "Bearer"},
    )

def decode_payload(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise _credentials_exception()

async def _get_user_by_email(email: str, db_session: AsyncSession) -> User:
    result = await db_session.execute(select(User).options(selectinload(User.role)).where(User.email == email))
    user = result.scalar()
    if user is None or user.is_blocked == True:
        raise _credentials_exception()
    return user

async def get_current_user(token: str = Depends(oauth2_scheme), db_session: AsyncSession = Depends(get_db)) -> User:
    """
    A jelenlegi felhasználó authentikálása.
    """
    payload = decode_payload(token.credentials)
    email: str = payload.get("sub")
    role_code: str = payload.get("role_code")

    if email is None or role_code is None:
        raise _credentials_exception()

    return await _get_user_by_email(email, db_session)
    
@dataclass
class EngineContext:
    user: User
    db: AsyncSession
    _permissions: set[str] | None = None   # lusta cache, requestenként egyszer töltve

    async def get_permissions(self) -> set[str]:
        if self._permissions is None:
            from permissions.service import get_effective_permissions
            self._permissions = set(await get_effective_permissions(self.user.id, self.db))
        return self._permissions

async def get_engine_context(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> EngineContext:
    """
    Context:
    A jelenlegi felhasználó authentikálása.
    """
    payload = decode_payload(token.credentials)
    email: str = payload.get("sub")
    role_code: str = payload.get("role_code")

    if email is None or role_code is None:
        raise _credentials_exception()

    user = await _get_user_by_email(email, db)

    return EngineContext(
        user=user,
        db=db
    )


def require_any_permission(*permissions: str):
    """
    Dependency factory:
    A felhasználónak legalább egy megadott jogosultsággal kell rendelkeznie.
    Különben 403 hiba.
    """
    async def check(ctx: EngineContext = Depends(get_engine_context)) -> EngineContext:
        effective = await ctx.get_permissions()
        if not any(p in effective for p in permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Legalább az egyik jogosultság szükséges: {', '.join(permissions)}",
            )
        return ctx
    return check

def require_permission(permission: str):
    """
    Dependency factory:
    A felhasználónak a megadott jogosultsággal kell rendelkeznie.
    Különben 403 hiba.
    """
    async def check(ctx: EngineContext = Depends(get_engine_context)) -> EngineContext:
        effective = await ctx.get_permissions()
        if permission not in effective:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Jogosultság szükséges: {permission}",
            )
        return ctx
    return check

async def check_for_any_permission(ctx: EngineContext, *permissions: str) -> bool:
    effective = await ctx.get_permissions()
    return any(p in effective for p in permissions)

_require_admin = require_permission("admin.permission")

type CurrentUserContext = Annotated[User, Depends(get_current_user)]
type AdminContext = Annotated[EngineContext, Depends(_require_admin)]

type AnyUserContext = Annotated[EngineContext, Depends(get_engine_context)] # For DEBUG only!