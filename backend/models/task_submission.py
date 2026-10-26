from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, Integer, BigInteger, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

class TaskSubmission(Base):
    __tablename__ = "task_submission"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(Integer, ForeignKey("task.id"))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("user.id"))
    class_letter: Mapped[str] = mapped_column(String(1))

    original_filename: Mapped[str] = mapped_column(String(255))
    stored_filename: Mapped[str] = mapped_column(String(255))  # uuid alapú, diskes név
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger)

    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)

    user = relationship("User")
    task = relationship("Task", back_populates="submissions")

    __table_args__ = (
        UniqueConstraint("task_id", "user_id", name="uq_submission_task_user"),
    )