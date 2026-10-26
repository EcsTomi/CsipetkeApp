from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from schemas import UserPublic

class ScoreCostume(BaseModel):
    class_letter: str = Field(..., min_length=1, max_length=1, description="A pontot kapó osztály")
    headcount: int
    notDressed: int
    extraItems: int
    ofDressed: bool
    note: Optional[str] = None


class RemoveScore(BaseModel):
    remove_details: str | None = None


class ScoreResponse(BaseModel):
    """Szervezők látják ezt: minden mezőt, beleértve a rejtett/visszavont infót is."""
    id: int
    class_letter: str
    headcount: int
    notDressed: int
    extraItems: int
    ofDressed: bool
    note: Optional[str]

    calculatedSum: int
    
    created_at: datetime
    created_by: Optional[UserPublic]
    modified_at: Optional[datetime]
    modified_by: Optional[UserPublic]
    is_removed: bool
    remove_details: Optional[str]
    removed_at: Optional[datetime]
    removed_by: Optional[UserPublic]

    class Config: from_attributes = True

class SummaryResponse(BaseModel):
    class_letter: str
    sum: int