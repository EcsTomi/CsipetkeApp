from datetime import datetime
from pydantic import BaseModel, Field

class JurorScoreUpsert(BaseModel):
    program_item_id: int
    score: int = Field(..., ge=0)

class JurorScoreResponse(BaseModel):
    program_item_id: int
    score: int
    updated_at: datetime

    class Config: from_attributes = True

class JuryWindowResponse(BaseModel):
    is_open: bool
    window_start: datetime | None
    window_end: datetime | None