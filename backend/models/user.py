from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import DateTime, ForeignKey, String, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(200), unique=True)
    picture: Mapped[str] = mapped_column(String(200))
    class_year: Mapped[int] = mapped_column(Integer)
    class_letter: Mapped[str] = mapped_column(String(1))
    role_code: Mapped[str] = mapped_column(String(20), ForeignKey("role.code"))
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(ZoneInfo("Europe/Budapest")))

    role = relationship("Role", back_populates="users")
    refresh_tokens = relationship("RefreshToken", back_populates="user")