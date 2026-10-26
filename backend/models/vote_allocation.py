from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from database import Base

class VoteAllocation(Base):
    __tablename__ = "vote_allocation" # Szavazás

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vote_id: Mapped[int] = mapped_column(Integer, ForeignKey("vote.id"))
    option_id: Mapped[int] = mapped_column(Integer, ForeignKey("vote_option.id"))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("user.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        UniqueConstraint("vote_id", "user_id", name="uq_vote_allocation_user"),
        Index("ix_vote_allocation_vote_user", "vote_id", "user_id"),
    )