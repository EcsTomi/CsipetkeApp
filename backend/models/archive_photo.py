from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, ForeignKey, String, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

class ArchivePhoto(Base):
    __tablename__ = "archive_photo"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    stored_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)

    caption: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    uploaded_by_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False)
    uploaded_by = relationship("User")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)

    is_deleted: Mapped[bool] = mapped_column(default=False)