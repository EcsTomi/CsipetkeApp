from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from models.point import PointSource
from schemas import UserPublic

class GetPoints(BaseModel):
    class_letter: Optional[str] = None
    task_id: Optional[int] = None

class CreatePoint(BaseModel):
    class_letter: str = Field(..., min_length=1, max_length=1, description="A pontot kapó osztály")
    amount: int = Field(..., description="Lehet negatív (levonás) is")

    task_id: int | None = None

    details: str | None = Field(default=None, max_length=500)

    visible_from: datetime | None = Field(default=None, description="Ha None, azonnal közzétett lesz (most)")


class RemovePoint(BaseModel):
    remove_details: str | None = None


class PointResponse(BaseModel):
    """Szervezők látják ezt: minden mezőt, beleértve a rejtett/visszavont infót is."""
    id: int
    class_letter: str
    amount: int
    task_id: Optional[int]
    source: PointSource
    details: Optional[str]
    created_at: datetime
    created_by: Optional[UserPublic]
    visible_from: datetime
    is_removed: bool
    remove_details: Optional[str]
    removed_at: Optional[datetime]
    removed_by: Optional[UserPublic]

    class Config: from_attributes = True

class SummaryResponse(BaseModel):
    class_letter: str
    public_amount: int
    hidden_amount: int | None = Field(
        default=None, description="Csak szervezőknek küldjük vissza"
    )

class PlacementEntry(BaseModel):
    class_letter: str = Field(..., min_length=1, max_length=1)
    placement: str  # pl. "1", "2", "3", "4" -- a Task.placement_points kulcsa

class BulkPlacementCorrection(BaseModel):
    task_id: int
    entries: list[PlacementEntry]  # akár mind a 4 osztály egyszerre, egy kérésben