from websocket.manager import websocket_manager

async def get_active_user_count() -> int:
    return len(websocket_manager.getActiveUsers())