from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from database import AsyncSessionLocal
import logging

logger = logging.getLogger(__name__)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception as exc:
            await session.rollback()
            raise