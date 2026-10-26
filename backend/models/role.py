from datetime import datetime

from sqlalchemy import DateTime, String, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

class Role(Base):
    __tablename__ = "role"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(20))

    users = relationship("User", back_populates="role")