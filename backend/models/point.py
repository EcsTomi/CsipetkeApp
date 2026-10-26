from datetime import datetime
from enum import Enum as PythonEnum
from typing import Optional
from sqlalchemy import DateTime, ForeignKey, Index, String, Integer, Boolean, Text, Enum as SQLEnum, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from models import Task, User
from database import Base

class PointSource(str, PythonEnum):
    manual = "manual"        # ember adta (szervező, admin, korábbi kézi pontrendszer)
    organizer = "organizer"
    jury_auto = "jury_auto"  # rendszer-generált, zsűri-átlagból

class Point(Base):
    __tablename__ = "point"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    class_letter: Mapped[str] = mapped_column(String(1), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # lehet negatív is

    # opcionális kapcsolódás feladathoz / kritériumhoz
    task_id: Mapped[Optional[int]] = mapped_column(ForeignKey("task.id"), nullable=True)

    source: Mapped[PointSource] = mapped_column(SQLEnum(PointSource), nullable=False, default=PointSource.manual)

    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.now)

    modified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    modified_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"), nullable=True)

    visible_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.now)

    is_removed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    remove_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    removed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    removed_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"), nullable=True)

    task: Mapped[Optional[Task]] = relationship()
    created_by: Mapped[Optional[User]] = relationship(foreign_keys=[created_by_id])
    modified_by: Mapped[Optional[User]] = relationship(foreign_keys=[modified_by_id])
    removed_by: Mapped[Optional[User]] = relationship(foreign_keys=[removed_by_id])

    __table_args__ = (
        Index("ix_point_class_letter_is_removed", "class_letter", "is_removed"),
        Index("ix_point_visible_from", "visible_from"),
        Index("ix_point_task_id", "task_id"),
        Index("ix_point_source", "source"),
        Index(
            "uq_point_jury_auto_active",
            "task_id", "class_letter",
            unique=True,
            postgresql_where=text("source = 'jury_auto' AND is_removed = false"),
        ),
    )