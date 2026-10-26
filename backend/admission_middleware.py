import asyncio
import os
import time
from dotenv import load_dotenv
import jwt
from jwt import PyJWTError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from websocket.manager import websocket_manager

load_dotenv()

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

GENERAL_CONCURRENCY = 35
ADMIN_RESERVED = 8
MAX_QUEUE_WAIT = 3.0

# Endpointok, amiket NEM akarunk a kapun átengedni (health check, statikus, stb.)
EXCLUDED_PATH_PREFIXES = ("/timing", "/admin/analytics")

class AdmissionControlMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._general_sem = asyncio.Semaphore(GENERAL_CONCURRENCY)
        self._admin_sem = asyncio.Semaphore(ADMIN_RESERVED)
        self._lastBroadcastTime = time.time()
        self._isFull = False
        AdmissionControlMiddleware.instance = self # Singleton

    def _extract_role(self, request: Request) -> str | None:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return None
        token = auth_header.removeprefix("Bearer ").strip()
        try:
            payload = jwt.decode(
                token,
                JWT_SECRET_KEY,
                algorithms=[JWT_ALGORITHM],
            )
        except PyJWTError:
            return None
        return payload.get("role_code")

    def get_stats(self) -> dict:
        return {
            "queue_full": self._isFull,
            "general_waiting": len(self._general_sem._waiters) if self._general_sem._waiters else 0,
            "general_available": self._general_sem._value,
            "admin_waiting": len(self._admin_sem._waiters) if self._admin_sem._waiters else 0,
            "admin_available": self._admin_sem._value,
        }

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path.startswith(EXCLUDED_PATH_PREFIXES):
            return await call_next(request)

        role_code = self._extract_role(request)
        if role_code is None:
            # nincs érvényes token -> engedjük tovább, a lenti auth dependency úgyis 401-et ad
            return await call_next(request)

        is_priority = role_code in ("jury", "admin")
        sem = self._admin_sem if is_priority else self._general_sem
        try:
            await asyncio.wait_for(sem.acquire(), timeout=MAX_QUEUE_WAIT)
        except asyncio.TimeoutError:
            if self._lastBroadcastTime + 10 < time.time():
                await websocket_manager.broadcast("queue_full", {"is_full": True})
                self._isFull = True
                self._lastBroadcastTime = time.time()
            return JSONResponse(
                status_code=503,
                content={"detail": "A rendszer jelenleg túlterhelt, próbáld újra pár másodperc múlva."},
                headers={"Retry-After": "5"},
            )

        try:
            return await call_next(request)
        finally:
            if self._general_sem._waiters is not None and len(self._general_sem._waiters) < 10 and self._isFull:
                await websocket_manager.broadcast("queue_full", {"is_full": False})
                self._isFull = False
            sem.release()