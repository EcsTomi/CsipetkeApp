from fastapi import APIRouter, HTTPException
from stats import service

router = APIRouter(prefix="/stats", tags=["Statistics for Arduino"])

@router.post("/users")
async def get_user_summary(static_token: str) -> int:
    if static_token != "ArduinoStatsRead":
        raise HTTPException(status_code=401, detail="Unauthorized")
    return await service.get_active_user_count()