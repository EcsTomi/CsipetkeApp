from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.ext.hybrid import hybrid_property
from database import Base

class Vote(Base):
    __tablename__ = "vote"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))

    visible_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    available_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deadline: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)

    modified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
    modified_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("user.id"), nullable=True)
    modified_by = relationship("User")
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    last_voted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)
    last_snapshot_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)

    options = relationship(
        "VoteOption",
        back_populates="vote",
        cascade="all, delete-orphan",
        order_by="VoteOption.id",
    )

    @hybrid_property
    def is_open(self) -> bool:
        from datetime import datetime as dt
        from zoneinfo import ZoneInfo
        now = dt.now(ZoneInfo("Europe/Budapest")).replace(tzinfo=None)
        if self.deadline is not None and self.deadline.astimezone(ZoneInfo("Europe/Budapest")).replace(tzinfo=None) < now:
            return False
        return self.available_from.astimezone(ZoneInfo("Europe/Budapest")).replace(tzinfo=None) <= now