import time

from fastapi import APIRouter, Query

router = APIRouter(prefix="/timing", tags=["Időzítés"])

@router.get("")
async def get_server_time(t0: float | None = Query(None)):
    t1 = time.time() * 1000  # kérés "megérkezése" — minél korábban hívd meg
    # (semmi extra munka a válasz előtt: ne legyen DB query, heavy logging itt)
    t2 = time.time() * 1000  # válasz kiküldése előtt
    return {"t0": t0, "t1": t1, "t2": t2}