import asyncio
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from database import AsyncSessionLocal
from models import Vote, VoteAllocation, VoteOptionSnapshot
from models.vote_option import VoteOption


SNAPSHOT_INTERVAL = 5  # másodperc


async def snapshot_worker():
    while True:
        for attempt in range(3):
            try:
                async with AsyncSessionLocal() as db:

                    # Minden nyitott szavazás
                    votes = (
                        await db.execute(
                            select(Vote).options(selectinload(Vote.options))
                        )
                    ).scalars().all()

                    now = datetime.now(ZoneInfo("Europe/Budapest"))

                    for vote in votes:
                        if vote.is_deleted or not vote.is_open:
                            continue
                        last_snapshot = vote.last_snapshot_at
                        last_voted = vote.last_voted_at

                        if (
                            last_snapshot is not None
                            and ((now - last_snapshot).total_seconds() < SNAPSHOT_INTERVAL or (last_voted is None or last_voted <= last_snapshot))
                        ):
                            continue

                        option_ids = [o.id for o in vote.options]

                        totals = dict(
                            (
                                await db.execute(
                                    select(
                                        VoteAllocation.option_id,
                                        func.count(VoteAllocation.id),
                                    )
                                    .where(
                                        VoteAllocation.option_id.in_(option_ids)
                                    )
                                    .group_by(VoteAllocation.option_id)
                                )
                            ).all()
                        )

                        db.add_all(
                            VoteOptionSnapshot(
                                option_id=oid,
                                total=totals.get(oid, 0),
                            )
                            for oid in option_ids
                        )

                        vote.last_snapshot_at = now

                    await db.commit()

                break
            except Exception as exc:
                import logging

                logging.exception("Snapshot worker hiba")
                await asyncio.sleep(1)  # rövid, exponenciális backoff helyett most elég fix 1s

        await asyncio.sleep(SNAPSHOT_INTERVAL)