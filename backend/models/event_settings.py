from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

class EventSettings(Base):
    """Singleton tábla — mindig csak 1 sor lesz benne (id=1)."""
    __tablename__ = "event_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    points_frozen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    jury_window_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    jury_window_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    winning_class: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)