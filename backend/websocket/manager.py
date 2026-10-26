import asyncio
from dataclasses import dataclass, field
from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder
from models.user import User

@dataclass
class Connection:
    websocket: WebSocket
    user_id: int
    class_letter: str
    role_code: str
    permissions: set[str]

@dataclass
class BroadcastEvent:
    type: str
    payload: dict
    require_all_permissions: list[str] | None = None
    require_any_permissions: list[str] | None = None
    require_no_permissions: list[str] | None = None
    class_letter: str | None = None
    exclude_user_id: int | None = None

class ConnectionManager:
    def __init__(self):
        self._connections: list[Connection] = []

        self._queue: asyncio.Queue[BroadcastEvent] = asyncio.Queue()
        self._worker_task: asyncio.Task | None = None

    async def start(self):
        if self._worker_task is None:
            self._worker_task = asyncio.create_task(self._broadcast_worker())

    async def stop(self):
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

    async def connect(self, websocket: WebSocket, user: User) -> Connection:
        await websocket.accept()
        from permissions.service import get_effective_permissions
        effective = await get_effective_permissions(user.id)
        conn = Connection(
            websocket=websocket,
            user_id=user.id,
            class_letter=user.class_letter,
            role_code=user.role_code,
            permissions=effective,  # ahogy az auth.isPermitted is használja
        )
        self._connections.append(conn)
        return conn

    def disconnect(self, conn: Connection):
        if conn in self._connections:
            self._connections.remove(conn)

    def getActiveUsers(self):
        return [conn.user_id for conn in self._connections]

    def countActiveUsersById(self):
        counts = {}
        for conn in self._connections:
            counts[conn.user_id] = counts.get(conn.user_id, 0) + 1
        return counts

    async def broadcast(
        self,
        type: str,
        payload: dict,
        *,
        require_all_permissions: list[str] | None = None,
        require_any_permissions: list[str] | None = None,
        require_no_permissions: list[str] | None = None,
        class_letter: str | None = None,
        exclude_user_id: int | None = None,
    ):
        await self._queue.put(
            BroadcastEvent(
                type=type,
                payload=payload,
                require_all_permissions=require_all_permissions,
                require_any_permissions=require_any_permissions,
                require_no_permissions=require_no_permissions,
                class_letter=class_letter,
                exclude_user_id=exclude_user_id,
            )
        )

    async def _broadcast_worker(self):
        while True:
            first = await self._queue.get()

            batch = [first]

            deadline = asyncio.get_running_loop().time() + 0.05

            while True:
                timeout = deadline - asyncio.get_running_loop().time()

                if timeout <= 0:
                    break

                try:
                    item = await asyncio.wait_for(self._queue.get(), timeout)
                    batch.append(item)
                except asyncio.TimeoutError:
                    break

            batch = self._coalesce(batch)

            for event in batch:
                await self._broadcast_now(event)

    def _coalesce(
        self,
        events: list[BroadcastEvent],
    ) -> list[BroadcastEvent]:

        latest: dict[tuple, BroadcastEvent] = {}
        result: list[BroadcastEvent] = []

        for event in events:
            if (
                event.type == "vote_results"
                and "vote_id" in event.payload
            ):
                key = (
                    event.type,
                    event.payload["vote_id"],
                    tuple(event.require_all_permissions or []),
                    tuple(event.require_any_permissions or []),
                    tuple(event.require_no_permissions or []),
                    event.class_letter,
                    event.exclude_user_id,
                )

                latest[key] = event
            else:
                result.append(event)

        result.extend(latest.values())

        return result
    
    async def _send(
        self,
        conn: Connection,
        event: BroadcastEvent,
    ) -> Connection | None:
        try:
            payload = jsonable_encoder(event.payload)
            await conn.websocket.send_json(
                {
                    "type": event.type,
                    "payload": payload,
                }
            )
            print(f"Sent: {event.type}") #DEBUG
            return None

        except Exception as exc:
            print(f"Broadcast send failed for user_id={conn.user_id}, type={event.type}: {exc!r}")
            return conn

    async def _broadcast_now(self, event: BroadcastEvent):
        targets = []
        print("Targets:", event.exclude_user_id, event.require_all_permissions, event.class_letter)
        for conn in self._connections:
            if event.exclude_user_id is not None and conn.user_id == event.exclude_user_id:
                continue
            if event.require_all_permissions and not set(event.require_all_permissions).issubset(conn.permissions):
                continue
            if event.require_any_permissions and not set(event.require_any_permissions).intersection(conn.permissions):
                continue
            if event.require_no_permissions and set(event.require_no_permissions).intersection(conn.permissions):
                continue
            if event.class_letter is not None and conn.class_letter != event.class_letter:
                continue

            targets.append(conn)
        print("Targets:", len(targets))
        dead = await asyncio.gather(
            *[
                self._send(conn, event)
                for conn in targets
            ],
            return_exceptions=True,
        )

        for result in dead:
            if isinstance(result, Connection):
                self.disconnect(result)

websocket_manager = ConnectionManager()