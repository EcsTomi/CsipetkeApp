from datetime import datetime
from typing import Optional
from sqlalchemy import Index, Integer, String, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base
from models.user import User
from sqlalchemy.ext.hybrid import hybrid_property

class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    action: Mapped[str] = mapped_column(String(50))  # pl. "point.create", "point.remove", "task.publish", "auth.login_failed"
    target_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    target_name: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    return_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # pl. 200, 404
    meta: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # extra kontextus

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"), nullable=True)

    user: Mapped[Optional[User]] = relationship()

    @hybrid_property
    def user_name(self) -> Optional[str]:
        # Python oldali működés
        return self.user.name if self.user else None
    
    @user_name.expression
    def user_name(cls):
        # SQL/Lekérdezés oldali működés
        return User.name

    __table_args__ = (
        Index("ix_audit_user_id", "user_id"),
        Index("ix_audit_action", "action"),
        Index("ix_audit_created_at", "created_at"),
        Index("ix_audit_target_name", "target_name"),
    )