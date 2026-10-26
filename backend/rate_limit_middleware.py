import os
import time
from collections import defaultdict, deque

from dotenv import load_dotenv
from fastapi import HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from auth.deps import EngineContext, decode_payload

import asyncio
from database import AsyncSessionLocal
from audit_log.service import log_audit
from models.user import User

load_dotenv()

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM")

GLOBAL_LIMIT = 100   # kérés
GLOBAL_SECONDARY_LIMIT = 400 # ping kérések (és DB művelet nélküliek) / admin
GLOBAL_WINDOW = 20   # másodperc
GLOBAL_BLOCK = 120    # másodperc

# Endpointok, amiket NEM akarunk a kapun átengedni (health check, statikus, stb.)
EXCLUDED_PATH_PREFIXES = ("/timing", "/admin/analytics")

class GlobalRateLimitMiddleware(BaseHTTPMiddleware):
    """
    Per-user globális rate limit minden kérésre.
    Csak a hits-eket számolja itt; az audit logolást a rate_limit()
    dependency-k intézik a write/critical rétegeken.
    """

    def __init__(self, app):
        super().__init__(app)
        self._hits: dict[int, deque] = defaultdict(deque)
        self._secondary_hits: dict[int, deque] = defaultdict(deque)
        self._blocks: dict[int, float] = {}
        self._global_hits: deque = deque() 
        self._anonim_hits: deque = deque()
        GlobalRateLimitMiddleware.instance = self # Singleton

    def _extract_user_id_and_name(self, request: Request) -> tuple[int | None, str | None, str | None, str | None]:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return (None, None, None, None)
        token = auth_header.removeprefix("Bearer ").strip()
        try:
            payload = decode_payload(token)
        except HTTPException:
            return (None, None, None, None)
        user_id = payload.get("id")
        user_name = payload.get("name")
        user_email = payload.get("sub")
        user_role_code = payload.get("role_code")
        try:
            return (int(user_id), user_name, user_email, user_role_code) if user_id is not None else (None, None, None, None)
        except (TypeError, ValueError):
            return (None, None, None, None)

    def _check(self, is_secondary: bool, user_id: int, user_name: str | None = None, user_email: str | None = None) -> bool:
        now = time.monotonic()
        if(not is_secondary):
            self._global_hits.append(now)  # ÚJ: minden hívásnál regisztráljuk
            while self._global_hits and now - self._global_hits[0] > GLOBAL_WINDOW:
                self._global_hits.popleft()

        if user_id in self._blocks:
            if now - self._blocks[user_id] < GLOBAL_BLOCK:
                return True
            del self._blocks[user_id]
        q = self._hits[user_id]
        q2 = self._secondary_hits[user_id]
        while q and now - q[0] > GLOBAL_WINDOW:
            q.popleft()
        while q2 and now - q2[0] > GLOBAL_WINDOW:
            q2.popleft()
        if len(q) >= GLOBAL_LIMIT and not is_secondary:
            self._blocks[user_id] = now
            asyncio.create_task(self._log_rate_limit_block(user_id, user_name, user_email, len(q), len(q2), is_secondary))  # audit logolás
            return True  # limitelve
        if len(q2) >= GLOBAL_SECONDARY_LIMIT and is_secondary:
            self._blocks[user_id] = now
            asyncio.create_task(self._log_rate_limit_block(user_id, user_name, user_email, len(q), len(q2), is_secondary))  # audit logolás
            return True
        if not is_secondary:
            q.append(now)
        else:
            q2.append(now)
        return False

    def get_stats(self) -> dict:
        """Admin summary endpoint hívja ezt."""
        now = time.monotonic()
        while self._global_hits and now - self._global_hits[0] > GLOBAL_WINDOW:
            self._global_hits.popleft()
        while self._anonim_hits and now - self._anonim_hits[0] > GLOBAL_WINDOW:
            self._anonim_hits.popleft()
        blocked_count = sum(1 for t in self._blocks.values() if now - t < GLOBAL_BLOCK)
        return {
            "requests_last_minute": len(self._global_hits),
            "anonim_requests_last_minute": len(self._anonim_hits),
            "currently_blocked_users": blocked_count,
        }

    async def dispatch(self, request: Request, call_next):
        user_id, user_name, user_email, role_code = self._extract_user_id_and_name(request)
        if user_id is None:
            # nincs érvényes token -> auth middleware/dependency úgyis elkapja lentebb
            self._anonim_hits.append(time.monotonic())
            while self._anonim_hits and time.monotonic() - self._anonim_hits[0] > GLOBAL_WINDOW:
                self._anonim_hits.popleft()
            return await call_next(request)

        path = request.url.path
        if self._check(path.startswith(EXCLUDED_PATH_PREFIXES) or role_code == "admin", user_id, user_name, user_email):
            return JSONResponse(
                status_code=429,
                content={"detail": "Túl sok kérés, próbáld később."},
                headers={"Retry-After": str(GLOBAL_WINDOW)},
            )

        return await call_next(request)

    async def _log_rate_limit_block(self, user_id: int, user_name: str | None = None, user_email: str | None = None, global_hits: int | None = None, secondary_hits: int | None = None, is_secondary: bool = False):
        try:
            async with AsyncSessionLocal() as session:
                await log_audit(
                    EngineContext(user=User(id=user_id), db=session),
                    action="rate_limit.blocked",
                    target_id=user_id,
                    target_name=user_name,
                    return_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    meta={"message": f"Globális rate limit ({global_hits} és {secondary_hits}))/{GLOBAL_WINDOW}s miatt blokkolva, {'másodlagos' if is_secondary else 'elsődleges'} szinten: {user_name} ({user_email}) (#{user_id})"},
                )
                await session.commit()
        except Exception as exc:
            # Audit log hiba SOSE dobjon exception-t a middleware-be vissza
            print(f"[audit_log] rate limit log failed for user {user_id}: {exc}")