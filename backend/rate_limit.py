from builtins import dict
import time
from collections import defaultdict, deque
from fastapi import HTTPException, Depends, Request, status
from audit_log.service import log_audit
from auth.deps import AnyUserContext, EngineContext, get_current_user
from models.user import User

TIERS = {
    "global":   (120, 60),
    "write":    (20, 60),
    "critical": (8, 60),
}

class RateLimiter:
    def __init__(self):
        self._hits: dict[tuple[int, str], deque] = defaultdict(deque)
        self._last_blocked_audit: dict[tuple[int, str], float] = {}

    def check(self, user_id: int, tier: str) -> bool:
        limit, window = TIERS[tier]
        key = (user_id, tier)
        now = time.monotonic()
        q = self._hits[key]

        while q and now - q[0] > window:
            q.popleft()

        if len(q) >= limit:
            return False

        q.append(now)
        return True

    def should_log_audit(self, user_id: int, tier: str, debounce_sec: int = 120) -> bool:
        key = (user_id, tier)
        now = time.monotonic()
        last = self._last_blocked_audit.get(key, 0)
        if now - last > debounce_sec:
            self._last_blocked_audit[key] = now
            return True
        return False

limiter = RateLimiter()

def rate_limit(tier: str):
    async def dependency(
        request: Request,
        ctx: AnyUserContext,
    ):
        if not limiter.check(ctx.user.id, tier):
            if limiter.should_log_audit(ctx.user.id, tier):
                # egyetlen audit bejegyzés a letiltás kezdetén, 2 perces debounce-szal
                await log_audit(ctx, "rate_limit.blocked", target_id=ctx.user.id, target_name=tier, return_code=status.HTTP_429_TOO_MANY_REQUESTS, meta={"tier": tier, "request_path": request.url.path})
            raise HTTPException(429, "Túl sok kérés, próbáld később.")
    return dependency