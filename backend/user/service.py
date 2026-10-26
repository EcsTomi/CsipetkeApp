from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from audit_log.service import log_audit
from auth.deps import EngineContext
from models.role import Role
from models.refresh_token import RefreshToken
from models import User
from fastapi import HTTPException, status


async def create_or_update_user(user_info: dict, db_session: AsyncSession) -> tuple[User, bool]:
    """Az adatbázisba frissítjük vagy létrehozzuk a felhasználót, visszaadjuk ha blokkolt."""
    user = await db_session.scalars(select(User).options(selectinload(User.role)).where(User.email == user_info["email"]))
    user = user.first()
    if not user:
        user = User(
            email=user_info["email"],
            name=user_info["name"],
            picture=user_info["picture"],
            class_year=user_info["class_year"],
            class_letter=user_info["class_letter"],
            role_code=user_info["role_code"],
        )
        db_session.add(user)
    else:
        if(user.is_blocked == True):
            return (user, True)
        user.name = user_info["name"]
        user.picture = user_info["picture"]
        user.last_login = datetime.now(ZoneInfo("Europe/Budapest"))
    await db_session.commit()
    await db_session.refresh(user, attribute_names=["role"])
    await log_audit(EngineContext(user, db_session), "user.login", return_code=status.HTTP_200_OK)
    return (user, False)

async def create_user_refresh_token(user: User, refresh_token: str, db_session: AsyncSession):
    refresh_token = RefreshToken(token=refresh_token, user_id=user.id)
    db_session.add(refresh_token)
    await db_session.commit()