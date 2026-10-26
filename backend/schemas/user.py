from pydantic import BaseModel

from auth.schemas import RoleResponse

class AuditUser(BaseModel):
    id: int
    name: str
    email: str
    role: RoleResponse | None = None
    class_year: int
    class_letter: str
    picture: str

    class Config: from_attributes = True

class UserPublic(BaseModel):
    id: int
    name: str
    role: RoleResponse | None = None
    class_year: int
    class_letter: str
    picture: str

    class Config: from_attributes = True