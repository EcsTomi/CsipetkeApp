from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://csipetke_db_user:csipetke_db_pw@db:5433/csipetke")

engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",
    pool_size=25,
    max_overflow=35,      # összesen max 60 egyidejű kapcsolat
    pool_timeout=15,      # ne várjon 30 mp-et, gyorsabban bukjon el -> gyorsabb hibavisszajelzés terhelés alatt
    pool_recycle=1800,    # 30 percenként újranyitja a kapcsolatokat (elkerüli a "stale connection" hibákat)
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

SQL_LOG_QUERIES = os.getenv("SQL_LOG_QUERIES", "false").lower() == "true"

class Base(DeclarativeBase):
    pass

if SQL_LOG_QUERIES:
    import logging
    from sqlalchemy import event

    query_logger = logging.getLogger("query_counter")

    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def _log_query(conn, cursor, statement, parameters, context, executemany):
        conn.info.setdefault("query_count", 0)
        conn.info["query_count"] += 1
        query_logger.debug(f"Query: {statement}")