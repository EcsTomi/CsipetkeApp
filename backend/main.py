import asyncio

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from fastapi.responses import JSONResponse
from admission_middleware import AdmissionControlMiddleware
from database import AsyncSessionLocal, engine, Base
from seed import seed_roles
from sqlalchemy.exc import IntegrityError, TimeoutError as SATimeoutError
from auth import router as auth_router
from permissions import router as permissions_router
from stats import router as stats_router

from vote_snapshot_worker import snapshot_worker
from websocket.manager import websocket_manager

from task import router as task_router
from point import router as point_router
from task_submission import router as submission_router
from vote import router as vote_router
from audit_log import router as audit_log_router
from event_settings import router as event_settings_router
from juror_score import router as juror_score_router
from program_item import router as program_item_router
from timing import router as timing_router
from websocket import router as websocket_router
from archive import router as archive_router
from costume_score import router as costume_score_router
from rate_limit_middleware import GlobalRateLimitMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Alap role-ok feltöltése, ha még nem léteznek
    async with AsyncSessionLocal() as session:
        await seed_roles(session)

    # Websocket start
    await websocket_manager.start()

    snapshot_task = asyncio.create_task(snapshot_worker())
    
    yield

    snapshot_task.cancel()

    # Websocket stop
    await websocket_manager.stop()

app = FastAPI(title="Csipetke API", root_path="", version="1.0.0", redirect_slashes=False, lifespan=lifespan)
app.add_middleware(GlobalRateLimitMiddleware)
app.add_middleware(AdmissionControlMiddleware)
app.include_router(auth_router)
app.include_router(permissions_router)
app.include_router(stats_router)
app.include_router(task_router)
app.include_router(point_router)
app.include_router(submission_router)
app.include_router(vote_router)
app.include_router(audit_log_router)
app.include_router(event_settings_router)
app.include_router(juror_score_router)
app.include_router(program_item_router)
app.include_router(timing_router)
app.include_router(websocket_router)
app.include_router(archive_router)
app.include_router(costume_score_router)
# CORS beállítások
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://csipetke.etomi.hu", "https://csipetke.lovassy.hu", "http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(SATimeoutError)
async def db_pool_timeout_handler(request: Request, exc: SATimeoutError):
    return JSONResponse(
        status_code=503,
        content={"detail": "A rendszer jelenleg túlterhelt, próbáld újra pár másodperc múlva."},
        headers={"Retry-After": "5"},
    )

@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    print("Ütközés!: ", exc)
    return JSONResponse(
        status_code=409,
        content={"detail": "Ütközés történt, próbáld újra."},
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)