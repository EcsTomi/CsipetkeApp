from datetime import datetime
from enum import Enum as PythonEnum
from typing import Optional
from sqlalchemy import DateTime, ForeignKey, Index, String, Integer, Boolean, Text, Enum as SQLEnum, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from models import Task, User
from database import Base
from sqlalchemy.ext.hybrid import hybrid_property

class CostumeScore(Base):
    __tablename__ = "costume_score"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    class_letter: Mapped[str] = mapped_column(String(1), nullable=False)

    headcount: Mapped[int] = mapped_column(Integer, nullable=False)
    notDressed: Mapped[int] = mapped_column(Integer, nullable=False)
    extraItems: Mapped[int] = mapped_column(Integer, nullable=False)
    ofDressed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.now)

    modified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    modified_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"), nullable=True)

    is_removed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    remove_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    removed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    removed_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"), nullable=True)

    created_by: Mapped[Optional[User]] = relationship(foreign_keys=[created_by_id])
    modified_by: Mapped[Optional[User]] = relationship(foreign_keys=[modified_by_id])
    removed_by: Mapped[Optional[User]] = relationship(foreign_keys=[removed_by_id])

    __table_args__ = (
        Index("ix_costume_score_class_letter_is_removed", "class_letter", "is_removed"),
    )

    @hybrid_property
    def calculatedSum(self):
        return self.headcount + self.extraItems - self.notDressed + (2 if self.ofDressed else 0)