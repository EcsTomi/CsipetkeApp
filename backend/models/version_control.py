from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Integer, String, DateTime, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

class VersionControl(Base):
    __tablename__ = "version_control"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "version_number", name="uq_entity_version"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(50), index=True)
    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    version_number: Mapped[int] = mapped_column(Integer)
    data: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    created_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("user.id"), nullable=True)

    created_by = relationship("User")