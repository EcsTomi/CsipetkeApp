from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from schemas import UserPublic

class ArchivePhotoResponse(BaseModel):
    id: int
    stored_hash: str
    original_filename: str
    width: int
    height: int
    caption: Optional[str]
    uploaded_at: datetime
    uploaded_by: UserPublic

    class Config:
        from_attributes = True