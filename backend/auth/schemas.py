from typing import List, Optional

from pydantic import BaseModel

class GoogleTokenBody(BaseModel):
    id_token: str
    nonce: str

class RefreshTokenBody(BaseModel):
    refresh_token: str

class RoleResponse(BaseModel):
    code: str
    name: str

    class Config: from_attributes = True

class ProfileResponse(BaseModel):
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_type: Optional[str] = None
    id: int
    email: str
    name: str
    role_code: str
    role: RoleResponse
    class_year: int
    class_letter: str
    picture: str

    permissions: List[str]

    class Config: from_attributes = True