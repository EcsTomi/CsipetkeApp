from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

class JurorScore(Base):
    __tablename__ = "juror_score"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    program_item_id: Mapped[int] = mapped_column(ForeignKey("program_item.id", ondelete="CASCADE"), nullable=False)
    juror_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False)

    score: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-10

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)

    program_item = relationship("ProgramItem", passive_deletes=True)
    juror = relationship("User")

    __table_args__ = (
        UniqueConstraint("program_item_id", "juror_id", name="uq_juror_score_item_juror"),
    )