from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class PermissionRow(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str] = None
    category: str

    class Config: from_attributes = True


class RoleRow(BaseModel):
    id: int
    code: str
    name: str

    class Config: from_attributes = True


class RoleDetailResponse(RoleRow):
    permissions: List[PermissionRow] = []

class RoleUpdateRequest(BaseModel):
    permission_codes: Optional[List[str]] = None  # None = nincs változás, [] = összes törlése


class UserPermissionOverride(BaseModel):
    permission_code: str
    code: str
    name: str
    granted: bool


class UserRoleAssignment(BaseModel):
    user_id: int
    roles: List[RoleRow] = []
    overrides: List[UserPermissionOverride] = []


class SetUserRolesRequest(BaseModel):
    role_code: str


class SetUserPermissionOverrideRequest(BaseModel):
    permission_code: str
    granted: bool

class UserAdminRow(BaseModel):
    """Egy sor a felhasználókezelő oldal listájában."""
    id: int
    name: str
    email: str
    picture: str
    class_year: int
    class_letter: str
    role: Optional[RoleRow] = None
    last_login: datetime
    is_active: bool
    active_count: int
    is_blocked: bool

    class Config: from_attributes = True

class UserSummary(BaseModel):
    user_count: int
    active_count: int

class AdminSummary(BaseModel):
    requests_last_minute: int
    anonim_requests_last_minute: int
    currently_blocked_users: int
    queue_full: bool
    general_waiting: int
    general_available: int
    admin_waiting: int
    admin_available: int