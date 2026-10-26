from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text
from database import Base


class Permission(Base):
    __tablename__ = "permission"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(100), unique=True, nullable=False) 
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=False)


class RolePermission(Base):
    __tablename__ = "role_permission"

    role_code = Column(String(20), ForeignKey("role.code", ondelete="CASCADE"), primary_key=True)
    permission_code = Column(String(100), ForeignKey("permission.code", ondelete="CASCADE"), primary_key=True)

class UserPermission(Base):
    __tablename__ = "user_permission"

    user_id = Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), primary_key=True)
    permission_code = Column(String(100), ForeignKey("permission.code", ondelete="CASCADE"), primary_key=True)
    granted = Column(Boolean, nullable=False, default=True)