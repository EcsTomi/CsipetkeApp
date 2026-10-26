from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

class RefreshToken(Base):
    __tablename__ = "refresh_token"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(200), unique=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    user = relationship("User", back_populates="refresh_tokens")