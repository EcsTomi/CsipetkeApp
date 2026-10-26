# task_submission/schemas.py
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from schemas import UserPublic


class SubmissionResponse(BaseModel):
    id: int
    task_id: int
    class_letter: str
    original_filename: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime
    user: UserPublic

    class Config:
        from_attributes = True