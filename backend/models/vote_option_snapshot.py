from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Index, Integer
from sqlalchemy.orm import Mapped, mapped_column
from database import Base

class VoteOptionSnapshot(Base):
    __tablename__ = "vote_option_snapshot" # Változások tárolása -> diagramhoz

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    option_id: Mapped[int] = mapped_column(Integer, ForeignKey("vote_option.id"))
    total: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)

    __table_args__ = (
        Index("ix_vote_option_snapshot_option_time", "option_id", "created_at"),
    )