from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from deps import get_db
from models.user import User
from websocket.manager import websocket_manager
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

@router.websocket("/ws")
async def ws_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
    db_session: AsyncSession = Depends(get_db),
):
    from auth import decode_payload
    try:
        payload = decode_payload(token)
        user_id = int(payload["id"])
    except (HTTPException, KeyError, ValueError):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user = await db_session.get(User, user_id)
    if user is None or user.is_blocked == True:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    conn = await websocket_manager.connect(websocket, user)
    try:
        while True:
            await websocket.receive_text()  # életben tartás, tartalmat nem várunk
    except WebSocketDisconnect:
        websocket_manager.disconnect(conn)